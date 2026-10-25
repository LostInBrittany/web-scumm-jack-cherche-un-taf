# The connector SDK

What every connector shares (`connectors/src/sdk.ts`, ADR 0008): the interface a connector implements, the context
it is given, the vocabulary of refusals, the limits, the helpers, and how the connectors are tested without a network.
For contributors who change a connector or add one; operators read [Connectors overview](bridge.connectors.md).

> [!LIMIT id=bridge-sdk-not-a-package-api]
> The SDK is not a public API of a package: `@quest-n-click/connectors` exports its command only (`./run`), and the
> four connectors are listed by id in `connectors/src/registry.ts`. A new connector is a change to the engine
> repository, with its threat model and its tests, not a plugin loaded from outside.

<a name="realityconnector"></a>
<!-- applies: .. since 4.1.9 -->

## `RealityConnector`

### Form

```ts
interface RealityConnector {
  readonly id: string;
  start(ctx: ConnectorContext): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ ok: boolean; detail: string; since: string }>;
}
```

### Values and default

- `start`: open its port or begin polling, with the context below.
- `stop`: stop taking input, let what is in flight finish (at most `DRAIN_MS`, 5 000 ms), close every socket.
- `health`: what `GET /health` answers (200 when `ok`, 503 otherwise; a `health` that throws is unhealthy).

### Constraints

A connector receives, validates and normalises its input, treats it as hostile, binds it to a player, gives it a
`dedupeKey`, and proposes; it never runs what it reads, and never sends the Bridge what it saw.

### Minimal example

The Telnet connector, `connectors/src/telnet/connector.ts`, is the shortest of the four.

### Behaviour on an unknown field

Not applicable: an interface of the code.

### Since

4.1.9.

<a name="connectorcontext"></a>
<!-- applies: .. since 4.1.9 -->

## `ConnectorContext`

### Form

Made by `createContext({ bridge, gameId, tenantId?, limits?, manifest, connector, write?, now?, retries?, fetch? })`.

### Values and default

| Member | What |
|---|---|
| `bridge` | `{ url, token }`: the Bridge and the connector's attenuated Biscuit |
| `gameId`, `tenantId` | The game; the tenant (`default`) |
| `limits` | [`ConnectorLimits`](#connectorlimits) |
| `manifest` | The game's Reality manifest: its signals and `connectors` declarations |
| `log(event, fields?)` | A JSON line that cannot carry content (see `safeLog`) |
| `propose(signal)` | [`ProposedSignal`](#proposedsignal) → `{ ok: true, sequence, duplicate }` or `{ ok: false, refusal }` |
| `pair(code)` | Confirms a pairing code (the token must carry `pair(true)`) → `{ ok: true, playerId }` or a refusal |
| `reject(reason, fields?)` | An input turned down by the connector itself: counted and logged |
| `metrics()` | `{ proposed, accepted, duplicates, refused, rejectedInputs, retries }`, for `/metrics` |

### Constraints

`propose` refuses before the Bridge a kind or a player that is not an identifier, a `dedupeKey` over 256 characters
(`shape`), a signal the manifest does not declare (`not-declared`), a payload that is not flat or is too large, and a
proposal over the local quota (`quota`). A call that times out, loses its connection, answers 5xx or answers an
acceptance without its sequence is sent again with the same key, `retries` times (2 by default); a refusal is never
retried. After `close()`, every call is refused `stopped`.

### Minimal example

```ts
const r = await ctx.propose({
  source: 'telnet', kind: 'terminal.lamp', playerId, dedupeKey: dedupeKey('telnet', `${session}:${line}`),
  payload: { command: 0, line }, receivedAt: new Date().toISOString(),
});
```

### Behaviour on an unknown field

An answer from the Bridge that is not a JSON object reads as `{}`.

### Since

4.1.9.

<a name="proposedsignal"></a>
<!-- applies: .. since 4.1.9 -->

## `ProposedSignal`

### Form

`{ source, kind, playerId, sessionId?, dedupeKey, payload, receivedAt }`.

### Values and default

- `source`: the connector family, informative; the Bridge checks the manifest's.
- `kind`: the signal, as the game declares it.
- `dedupeKey`: the same fact twice has the same key, `dedupeKey(source, external id)`.
- `payload`: flat JSON (strings, numbers, booleans, null), no markup (`<` or `>`), at most `limits.maxBytes`. It stays
  in the connector; the Bridge receives its SHA-256 over canonical JSON as `evidenceHash`.
- `receivedAt`: ISO time on the connector's clock, sent as `occurredAt` (the Bridge stamps its own).

### Constraints

A nested, marked-up or oversized payload is refused (`shape`, `too-large`).

### Minimal example

See [`ConnectorContext`](#connectorcontext).

### Behaviour on an unknown field

Not sent: the SDK builds the Bridge's body from the fields above only.

### Since

4.1.9.

<a name="refusalcode"></a>
<!-- applies: .. since 4.1.9 -->

## `RefusalCode`

### Form

A fixed vocabulary, never the Bridge's free text.

### Values and default

| Code | From |
|---|---|
| `shape`, `too-large`, `quota`, `not-declared`, `stopped` | The SDK, before the Bridge (`shape` also for a Bridge's 400, `too-large` for its 413) |
| `denied` | The Bridge's 401 or 403 |
| `revoked` | The Bridge's 401 `revoked` |
| `player` | The Bridge's 404 for a player |
| `pairing` | A malformed code; the Bridge's 404 for a code, 409 or 410 |
| `pending` | The Bridge's 429 `pending` (the player's backlog) |
| `bridge-quota` | The Bridge's other 429 |
| `timeout`, `unreachable` | No answer within `timeoutMs`; no connection |
| `bridge` | Another status, or a 5xx after the retries |

### Constraints

Counted in `metrics().refused` and logged as `signal.refused` with the code.

### Minimal example

`if (!r.ok && r.refusal === 'pending') …` (the player has too many signals waiting).

### Behaviour on an unknown field

A status the table does not name is `bridge`.

### Since

4.1.9.

<a name="connectorlimits"></a>
<!-- applies: .. since 4.1.9 -->

## `ConnectorLimits`

### Form

`{ maxBytes, maxPerMinute, timeoutMs }`, the configuration's `limits`.

### Values and default

`maxBytes` 4 096 (a payload as canonical JSON, and the largest input read at once), `maxPerMinute` 60 (proposals per
sliding minute, all players together; the Bridge has its own quota per token), `timeoutMs` 5 000 (one call to the
Bridge).

### Constraints

A limit left out keeps its default.

### Minimal example

```json
"limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 }
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.9.

<a name="helpers"></a>
<!-- applies: .. since 4.1.9 -->

## Helpers

### Form

`dedupeKey(source, external)`, `canonicalJson(value)`, `payloadProblem(payload, maxBytes)`, `safeLog(write,
connector)`, `within(work, ms)`, `DRAIN_MS`, `DEFAULT_LIMITS`.

### Values and default

- `dedupeKey`: SHA-256 of `<source>:<its id outside>`, in hexadecimal.
- `canonicalJson`: JSON with sorted keys, so a payload's hash does not depend on the order it was built in.
- `payloadProblem`: `'shape'`, `'too-large'` or `null`.
- `safeLog`: numbers and booleans as they are; a string only when it is an identifier (letters, digits, `.`, `_`,
  `:`, `-`, at most 64), never with an `@`, a space or a slash; anything else is `[redacted]`. Field names that are
  not identifiers are dropped.
- `within`: resolves `done` or `timeout`, whichever comes first (a drain never holds a stop longer).

### Constraints

None.

### Minimal example

`dedupeKey('email', messageId)` is the email connector's key.

### Behaviour on an unknown field

Not applicable.

### Since

4.1.9.

<a name="testing"></a>

## Testing without a network

All in the engine repository, one suite at a time:

```sh
# in the engine repository
npx vitest run tests/connectors-*.test.ts
npm run fuzz:connectors -- --cases=200 --seconds=30 --seed=1
```

- `tests/connectors-*.test.ts` run the same contract on the four connectors against a real Bridge on a free port
  (`tests/connectors-sdk.test.ts`), their hostile fixtures (`connectors/test-vectors/`), Telnet and SSH under floods,
  slow clients and a thousand connections, and the four driven under `--disallow-code-generation-from-strings`.
- `npm run fuzz:connectors` feeds the connectors' parsers seeded mutations of their corpus
  (`--connector=email|telnet|ssh|open-badge|all`, `--cases` 10 000 by default, `--seconds` 60, `--seed`, `--json`).
- A game's recorded replays (`games/<id>/replays/*.json`: connector inputs and the signals they made) are replayed
  through the real connector code by `tests/connectors-replays.test.ts`, and proved finishable by
  `npm run solve:reality`.
- `npm run connector-archive-e2e` plays the four from their release archive against a Bridge from its own (Linux).

> [!GUARANTEE id=bridge-sdk-same-key-one-effect]
> Two connectors sending the same key three times each make one sequence and one logical effect.

<a name="related"></a>

## Related identifiers

- `quest-n-click-connector`, `npm run connector`: [Connectors overview](bridge.connectors.md#run-one).
- The Bridge's side of a proposal: [Guarantees](bridge.guarantees.md#duplicates).
- How tests are chosen and run: [Which tests run when](contribute.which-tests.md); mutation testing of the connectors:
  [Mutation testing](contribute.mutation-testing.md).
