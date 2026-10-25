# Signals and the manifest

What a game declares to receive signals from the world outside (`reality` in its definition), what the build makes of
it (the Reality manifest the Bridge checks), and what a signed signal holds. For authors; the reference of every field.
A signal is an identifier from a finite list the game declares, and it reaches the game as the event of the same name:
nothing from outside but this identifier reaches the game, no text, no address, no payload, so nothing outside can
inject a line, a flag or HTML.

A complete declaration, from the sample game's family (`games/signals/game.ts` is the real one):

```ts
reality: {
  bridge: 'https://bridge.example/',          // the Bridge the pause menu links to (http://127.0.0.1 while developing)
  signals: [
    { id: 'mail.answer.correct', source: 'mail', availability: 'required', replay: 'record',
      fallback: { verb: 'use', a: 'radio' } },  // what a player does when the outside never answers
    { id: 'mail.answer.wrong', source: 'mail', availability: 'optional', replay: 'record' },
    { id: 'hook.bell', source: 'webhook', availability: 'optional', replay: 'record', once: false },
  ],
},
events: [
  { id: 'mail-opens-gate', on: 'mail.answer.correct', do: [{ set: 'gate_open' }, 'A letter: "Yes."'] },
],
```

<a name="reality-bridge"></a>
<!-- applies: .. since 4.1.1 -->

## `reality.bridge`

### Form

A URL, a string.

### Values and default

The Reality Bridge the pause menu's **World link** pairs with: `https://…`, or `http://127.0.0.1` or `http://localhost`
(with a port) while developing. Absent: the signals reach the game only through the Studio's simulator. It is public,
not a secret.

### Constraints

`npm run validate` refuses another scheme or host: `reality.bridge: "<url>": an https:// URL (http:// only for
127.0.0.1 or localhost)`.

### Minimal example

```ts
reality: { bridge: 'https://bridge.example.org/', signals: [/* … */] }
```

### Behaviour on an unknown field

See [`reality.signals`](#reality-signals).

### Since

4.1.1.

<a name="reality-signals"></a>
<!-- applies: .. since 4.1.1 -->

## `reality.signals`

### Form

An array of signals; each is `{ id, source, availability, replay, once?, fallback? }`.

### Values and default

- **`id`**: the signal, and the event it emits. Letters, digits and `. _ : -`, at most 128 characters
  (`mail.answer.correct`).
- **`source`**: where it comes from, a connector's family (`mail`, `webhook`, `email`, `terminal`, `badge`…). A
  connector's token names the sources it may propose, and the Bridge refuses a signal proposed under another source
  (422 `source`).
- **`availability`**: `optional`, or `required` when the main ending needs it.
- **`replay`**: `record`, the only mode: the signal is an entry of the session, replayed offline.
- **`once`** (default `true`): the signal's effect runs once per game, however many times it arrives. `false`: each
  distinct signal from the Bridge runs it again; a repeated delivery of the same one never does.
- **`fallback`**: for a `required` signal, the action a player can use instead, `{ verb, a, b?, do? }`.

### Constraints

`npm run validate` says, for `reality.signals[<i>]`:

- `signal id "<id>": letters, digits and . _ : - only, at most 128`; `signal "<id>" is declared twice`;
- `a signal names its \`source\` (mail, webhook…)`;
- `\`availability\` is "optional" or "required"`; `\`replay\` is "record" (the only mode of 4.1.1)`;
- `required signal "<id>" has no \`fallback\`: what a player does when the outside never answers`, or `the fallback of
  "<id>" (<verb> <a>) matches no rule`;
- a warning, `signal "<id>" is declared but nothing listens to it`.

In a game with `reality`, an event listened to that nothing emits nor declares is an error (`event "<ev>" is never
emitted nor declared in reality.signals`): a typo would otherwise wait forever for a signal the Bridge refuses. A
`required` signal also needs a scenario that sends it, and the game must be finishable without the outside: the
content lint checks the closed witness plays the fallback ([Guarantees](bridge.guarantees.md#proof)).

### Minimal example

```ts
reality: {
  signals: [{ id: 'hook.bell', source: 'webhook', availability: 'optional', replay: 'record' }],
},
events: [{ id: 'bell-rings', on: 'hook.bell', do: ['Somewhere, a bell.'] }],
```

### Behaviour on an unknown field

The validator does not look at it, and TypeScript refuses it when the game is typed `GameDef` (`npm run check`). The
manifest keeps only `id`, `source`, `availability` and `replay` of each signal: nothing else reaches the Bridge.

### Since

4.1.1.

<a name="reality-connectors"></a>
<!-- applies: .. since 4.1.9 -->

## `reality.connectors`

### Form

An object, `{ email?, telnet?, ssh?, 'open-badge'? }`: what each connector may turn into a signal, as data. Public:
it goes into the manifest.

### Values and default

- **`email`**: `{ answers: [{ words: string[], signal }], otherwise? }`. The first answer whose words all appear in
  the subject or the text (whole words, any case) proposes its signal; else `otherwise`.
- **`telnet`**: `{ banner?, prompt?, commands: [{ says, reply, signal? }] }`. `says` is matched whole, never as a
  pattern; `reply` is printed back; a command without `signal` only answers.
- **`ssh`**: the same, plus `files`: the virtual disk, `{ "/notes/lamp.txt": "text" }`, read with `ls`, `cd`, `cat`.
- **`'open-badge'`**: `{ issuers: string[], valid, invalid?, expired?, revoked?, indeterminate? }`: the issuers whose
  badges count, and the signal of each verdict.

```ts
reality: {
  signals: [
    { id: 'letter.door', source: 'email', availability: 'optional', replay: 'record' },
    { id: 'terminal.lamp', source: 'terminal', availability: 'optional', replay: 'record' },
  ],
  connectors: {
    email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' },
    telnet: { prompt: 'shed> ', commands: [{ says: 'lamp on', reply: 'Click.', signal: 'terminal.lamp' }] },
    ssh: { commands: [/* the same */], files: { '/notes/lamp.txt': 'The lamp obeys two words.' } },
    'open-badge': { issuers: ['https://badges.example.org/issuer'], valid: 'badge.valid', revoked: 'badge.refused' },
  },
}
```

### Constraints

Checked by `npm run validate`; every signal named is one of `reality.signals` (`signal "<id>" is not declared in
reality.signals`):

- `email.answers[].words`: one or more, each 1 to 64 letters or digits, no space;
- `telnet` and `ssh` `commands[].says`: lower-case words of letters, digits and `-`, one space apart (at most 8 words
  of 32 characters); not `help`, `exit`, `quit`, `clear`, `ls`, `cd`, `cat` or `pwd` (the terminal's own); not twice.
  `reply`: plain text, at most 2 000 characters;
- `ssh.files`: absolute paths of plain names, no `.` or `..`, at most 8 deep; at most 16 KB of text each;
- `open-badge.issuers`: one or more issuer ids (URLs or DIDs), at most 512 characters each.

No pattern, script or path of the author's reaches a connector.

### Minimal example

```ts
connectors: { telnet: { commands: [{ says: 'lamp on', reply: 'Click.', signal: 'terminal.lamp' }] } }
```

### Behaviour on an unknown field

Kept in the manifest as written, and ignored by the connectors, which read only the fields above.

### Since

4.1.9. Each connector: [Connectors overview](bridge.connectors.md).

<a name="scenarios"></a>
<!-- applies: .. since 4.1.1 -->

## `reality/scenarios/*.json`

### Form

One JSON file per scenario in `games/<id>/reality/scenarios/` (in a created project, the game's `reality/scenarios/`
folder): `{ "signals": ["<id>", …] }`.

### Values and default

The signals the world sends, in that order, each able to arrive at any point after the one before.
`npm run solve:reality` proves the game in each scenario, then in each replay the connectors recorded
(`games/<id>/replays/*.json`, their `signals` in order), as well as in the closed and adversarial worlds.

### Constraints

Each signal is a declared one (`scenario <name>: "<id>" is not declared`). When the game has `required` signals,
at least one scenario sends every one of them (`no scenario sends every required signal (…): add one in
reality/scenarios/`).

### Minimal example

```json
{ "signals": ["mail.answer.wrong", "mail.answer.correct"] }
```

### Behaviour on an unknown field

Only `signals` is read.

### Since

4.1.1.

<a name="reality-manifest"></a>
<!-- applies: .. since 4.1.1 -->

## The Reality manifest (`dist/reality-manifest.json`)

### Form

```json
{
  "format": "web-scumm-reality-manifest",
  "schema": 1,
  "gameId": "signals",
  "signals": [{ "id": "hook.bell", "source": "webhook", "availability": "optional", "replay": "record" }],
  "connectors": { "telnet": { "commands": [] } }
}
```

### Values and default

Made from the game's content: `npm run build` writes it to `dist/reality-manifest.json` when the game declares
`reality`, and `npm run bridge -- init` reads it from the content. The signals are sorted by id; `connectors` is
present only when the game declares it. It holds no secret. Its hash, `manifestHash`, is the SHA-256 of its JSON, keys in this fixed order, in hexadecimal.

### Constraints

The Bridge keeps the hash in its `config.json` and refuses to start on another manifest: `the game's manifest (…) is
not the one configured (…)`, so an old configuration cannot publish a signal the game renamed or removed. It answers
`GET /v1/manifest` with `{ manifest, hash }`; a connector reads it there, or from its `manifestFile`.

### Minimal example

The standalone Bridge starts from it: `npx quest-n-click-bridge init --manifest=<game>/dist/reality-manifest.json`.

### Behaviour on an unknown field

The manifest is made, not written by hand; a signal's fields beyond the four are left out.

### Since

4.1.1; `connectors` since 4.1.9.

<a name="world-signal"></a>
<!-- applies: .. since 4.1.1 -->

## The signed signal (`WorldSignalV1`, `WorldSignalV2`)

### Form

A compact JWS (`alg: EdDSA`, a `kid` naming the key), at most `MAX_SIGNAL_CHARS` (4 096) characters. The player
verifies the signature on the exact bytes before it parses them.

### Values and default

Both versions: `format` (`web-scumm-world-signal`), `schema` (1 or 2), `id` (unique per signal on the Bridge),
`sequence` (per player, from 1), `gameId`, `playerId`, `signal`, `source`, `occurredAt?` (the connector's time, for
information), `receivedAt`, `expiresAt?`, `dedupeKey`, `policyVersion`, `evidenceHash?` (a SHA-256 of what the
connector saw, never the evidence). V2 adds `tenantId`, `environment` (`prod`, `staging`, `dev`), `audience` (the origin
the player paired from, or the Bridge's audience), `sessionId` (the link) and `keyId` (equal to the header's `kid`).

### Constraints

The player checks the size, the algorithm, the key (each within its window), the signature, then the game, the player,
the manifest and the expiry (five minutes of tolerance for the device's clock), and for V2 the context
(`audience-mismatch`). A refusal has a code (14 of them, `RefusalCode`). A multi-tenant Bridge signs V2 only; a
single-tenant Bridge signs V1 unless its configuration says `signalVersion: 2`; the player accepts both by default.

### Minimal example

What the session keeps of one: `{ external: { id, sequence, signal, source, receivedAt, playerId } }`.

### Behaviour on an unknown field

Refused: both payloads are strict schemas.

### Since

V1 4.1.1; V2 4.1.10 (ADR 0010).

<a name="related"></a>

## Related identifiers

- The module `@quest-n-click/engine/reality` (`verifySignal`, `RealityClient`, `httpPort`, `SignalSimulator`,
  `realityManifest`, `manifestHash`, `verifyDayToken`…), for a game with its own transport (`WorldSignalPort`):
  [Public API](engine.api.md#reality).
- The interface texts of the World link (`realityLink`…): [Quick start](bridge.quick-start.md#player).
- `npm run validate`, `npm run solve:reality`, `npm run lint`: [Checking your game](create.checking.md).
- The sample game: `games/signals/` ([Example games](create.example-games.md)).
