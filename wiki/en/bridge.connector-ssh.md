# SSH connector

The SSH connector opens a virtual terminal over SSH: a player logs in with the pairing code their game shows as the
password (or with a public key the operator declared for them), then types the commands the game declares, and reads
the files of the game's virtual disk with `ls`, `cd` and `cat`. Nothing typed is ever run: there is no shell behind
it. It is experimental, like every connector ([Connectors overview](bridge.connectors.md)).

<a name="what-you-get"></a>

## What you get

A `quest-n-click-connector ssh` process listening on a port with its own host key, answering the commands of
`reality.connectors.ssh` and showing its `files`, and proposing the commands' signals for the player who logged in.
Unlike [Telnet](bridge.connector-telnet.md), what is typed is encrypted on the way.

<a name="context-and-versions"></a>

## Context and versions

- A connector beside a running Bridge, from 4.1.9; this page applies from 4.2.5 (the `quest-n-click-connector` name).
- `ssh2` (pure JavaScript, MIT) carries the protocol; its optional native parts are refused (`connectors/vendor/`).
- **Verified on: not replayed for this page.** CI plays it from the release archive (`npm run connector-archive-e2e`:
  the pairing code as password, the commands, a file of the virtual disk) and under floods in
  `tests/connectors-ssh.test.ts`; no person has yet run it on a network.

<a name="prerequisites"></a>

## Prerequisites

- A running Bridge ([Install and run the Bridge](bridge.install-run.md)) and a game whose `reality.connectors.ssh`
  declares its commands and files ([Signals and the manifest](bridge.signals-manifest.md#reality-connectors)):

  ```ts
  ssh: {
    prompt: 'shed$ ',
    commands: [{ says: 'lamp on', reply: 'Click.', signal: 'terminal.lamp' }],
    files: { '/notes/lamp.txt': 'The lamp obeys two words: lamp on.' },
  }
  ```

- `ssh-keygen`, to make the connector's host key.

<a name="where-to-run"></a>

## Where to run the commands

`grant` where the Bridge's folder is; the connector on the machine players connect to, in a folder holding its
configuration, token and host key (mode 600). `npm run connector -- ssh …` in the engine repository,
`npx quest-n-click-connector ssh …` with the package.

<a name="steps"></a>

## Steps

<!-- step: grant -->
1. Grant the connector its token, with pairing:

   ```sh
   # in the engine repository (the Bridge's folder is .cache/bridge)
   npm run bridge -- grant --connector=shed-ssh --source=terminal --signals=terminal.lamp --pair > ssh.token
   ```

<!-- step: host-key -->
2. Make the connector's host key:

   ```sh
   # in the connector's folder
   ssh-keygen -t ed25519 -f ssh_host_ed25519_key -N ''
   ```

<!-- step: config -->
3. Write its configuration, `ssh.json`. `keys` is optional: a public key per player, for players who would rather not
   type a code:

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "ssh.token" },
     "gameId": "signals",
     "health": { "port": 9303 },
     "ssh": { "port": 2222, "hostKeyFile": "ssh_host_ed25519_key", "keys": [{ "key": "ssh-ed25519 AAAA…", "playerId": "p-0123456789abcdef" }] }
   }
   ```

<!-- step: run -->
4. Start it:

   ```sh
   # in the engine repository
   npm run connector -- ssh --config ssh.json
   ```

<!-- step: connect -->
5. Log in as a player would; the user name does not matter, the password is the code the game shows:

   ```sh
   # on a machine that reaches the port
   ssh -p 2222 player@127.0.0.1
   ```

   After the banner, `lamp on` prints the command's reply and proposes `terminal.lamp`; `ls /notes` and
   `cat /notes/lamp.txt` read the virtual disk.

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET http://127.0.0.1:9303/health` answers 200; `GET /metrics` counts proposals and refusals.
- The Bridge logs `"event":"pairing.confirmed"` (for a password login with a code), then `"event":"signal.accepted"`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `ssh: "hostKeyFile" names the host key` at start | No host key in the configuration | Step 2, then `hostKeyFile` |
| `Permission denied`, then the connection closes | A wrong or expired code, a resume word past its 30 minutes, or an undeclared key, three times | A new code from the game |
| The connection is refused at once | Six wrong passwords from that address in ten minutes, across reconnections; 3 connections already open from it, or 20 in all | Wait |
| A command given on the `ssh` line, `sftp`, `scp` or a forwarding is refused | Only an interactive terminal opens | Log in without a command |
| The connection closes | Not authenticated within 20 seconds; authenticated without opening a shell for a minute | Open the terminal at once |

<a name="files-changed"></a>

## Files or data changed

None on disk. Resume words live in memory for 30 minutes; nothing typed is stored.

<a name="recovery"></a>

## Recovery or going back

Stop the process (SIGTERM). A player's declared key is removed from `ssh.keys`, then the connector restarted. If the
connector's token leaked, revoke it on the Bridge and grant a new one; if its host key leaked, make a new one (players'
SSH clients will warn that the host key changed).

<a name="behaviour"></a>

## Reference: what the terminal does

- `ssh: { "port", "host" (127.0.0.1), "hostKeyFile", "keys"?, "limits"? }`.
- The password is a pairing code or a resume word (three tries per connection); or a public key the operator declared
  for a player (`keys`).
- Only a terminal opens: the game's commands, `help`, `clear`, `exit`, and `ls`, `cd`, `pwd`, `cat` on the game's
  virtual disk (`files`). `exec`, `sftp` (any subsystem), environment, agent, X11 and forwarding are refused. One
  session with one shell per connection.
- Paths never leave the virtual tree, nothing typed is interpreted. The output wraps at the terminal's width (10 to
  500 columns, 80 by default).
- The same limits as Telnet (a line of 512 bytes, 100 lines a minute, 64 KB a second received, 20 seconds to log in,
  a minute between lines, 30 minutes a session, 3 connections per address and 20 in all, 6 wrong passwords per address
  in 10 minutes), each overridable in `limits` by its name ([Telnet](bridge.connector-telnet.md#behaviour)).
- Each line typed is a new fact: its key is `sha256('ssh:' + session + ':' + line number)`.

> [!GUARANTEE id=bridge-ssh-terminal-only]
> The SSH connector refuses `exec`, `sftp` and forwarding; only its virtual terminal opens.

<a name="privacy"></a>

## What it keeps

Nothing typed is stored: a line is matched against the game's commands and forgotten; the Bridge receives only the
signal's name. A resume word links a later session to the same player for 30 minutes, in memory. The public keys an
operator declares for players live in the connector's configuration until the operator removes them. The client's
address is used for the connection and counted in memory for the limits; the connector keeps no list of them.

<a name="references"></a>

## References

- The code: [`connectors/src/ssh/connector.ts`](../../connectors/src/ssh/connector.ts),
  [`connectors/src/terminal/`](../../connectors/src/terminal/guard.ts).
- The threat model: [`docs/dev/threat-models/ssh.md`](../../docs/dev/threat-models/ssh.md).
- Tested by [`tests/connectors-ssh.test.ts`](../../tests/connectors-ssh.test.ts).

