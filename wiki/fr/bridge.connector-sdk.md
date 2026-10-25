# Le SDK des connecteurs

Ce que partagent tous les connecteurs (`connectors/src/sdk.ts`, ADR 0008) : l’interface qu’un connecteur implémente,
le contexte qu’il reçoit, le vocabulaire des refus, les limites, les fonctions utilitaires, et la façon dont les
connecteurs sont testés sans réseau. Pour les contributeurs qui modifient un connecteur ou en ajoutent un ; les
opérateurs lisent la [Vue d’ensemble des connecteurs](bridge.connectors.md).

> [!LIMIT id=bridge-sdk-not-a-package-api]
> Le SDK n’est pas l’API publique d’un paquet : `@quest-n-click/connectors` n’exporte que sa commande (`./run`), et les
> quatre connecteurs sont listés par identifiant dans `connectors/src/registry.ts`. Un nouveau connecteur est une
> modification du dépôt du moteur, avec son modèle de menace et ses tests, pas une extension chargée de l’extérieur.

<a name="realityconnector"></a>
<!-- applies: .. since 4.1.9 -->

## `RealityConnector`

### Forme

```ts
interface RealityConnector {
  readonly id: string;
  start(ctx: ConnectorContext): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ ok: boolean; detail: string; since: string }>;
}
```

### Valeurs et défaut

- `start` : ouvrir son port ou commencer à relever, avec le contexte ci-dessous.
- `stop` : ne plus prendre d’entrée, laisser finir ce qui est en cours (au plus `DRAIN_MS`, 5 000 ms), fermer chaque
  socket.
- `health` : ce que répond `GET /health` (200 quand `ok`, 503 sinon ; un `health` qui lève une exception est en
  mauvaise santé).

### Contraintes

Un connecteur reçoit son entrée, la valide et la normalise, la traite comme hostile, la rattache à un joueur, lui
donne une `dedupeKey`, et propose ; il n’exécute jamais ce qu’il lit, et n’envoie jamais au Bridge ce qu’il a vu.

### Exemple minimal

Le connecteur Telnet, `connectors/src/telnet/connector.ts`, est le plus court des quatre.

### Comportement face à un champ inconnu

Sans objet : une interface du code.

### Depuis

4.1.9.

<a name="connectorcontext"></a>
<!-- applies: .. since 4.1.9 -->

## `ConnectorContext`

### Forme

Fabriqué par `createContext({ bridge, gameId, tenantId?, limits?, manifest, connector, write?, now?, retries?, fetch? })`.

### Valeurs et défaut

| Membre | Quoi |
|---|---|
| `bridge` | `{ url, token }` : le Bridge et le Biscuit atténué du connecteur |
| `gameId`, `tenantId` | Le jeu ; le tenant (`default`) |
| `limits` | [`ConnectorLimits`](#connectorlimits) |
| `manifest` | Le manifeste Reality du jeu : ses signaux et ses déclarations `connectors` |
| `log(event, fields?)` | Une ligne JSON qui ne peut pas porter de contenu (voir `safeLog`) |
| `propose(signal)` | [`ProposedSignal`](#proposedsignal) → `{ ok: true, sequence, duplicate }` ou `{ ok: false, refusal }` |
| `pair(code)` | Confirme un code d’appairage (le jeton doit porter `pair(true)`) → `{ ok: true, playerId }` ou un refus |
| `reject(reason, fields?)` | Une entrée refusée par le connecteur lui-même : comptée et journalisée |
| `metrics()` | `{ proposed, accepted, duplicates, refused, rejectedInputs, retries }`, pour `/metrics` |

### Contraintes

`propose` refuse avant le Bridge un type ou un joueur qui n’est pas un identifiant, une `dedupeKey` de plus de 256
caractères (`shape`), un signal que le manifeste ne déclare pas (`not-declared`), une charge qui n’est pas plate ou
est trop grosse, et une proposition au-delà du quota local (`quota`). Un appel qui dépasse son délai, perd sa
connexion, reçoit une 5xx ou une acceptation sans sa séquence est renvoyé avec la même clé, `retries` fois (2 par
défaut) ; un refus n’est jamais réessayé. Après `close()`, chaque appel est refusé `stopped`.

### Exemple minimal

```ts
const r = await ctx.propose({
  source: 'telnet', kind: 'terminal.lamp', playerId, dedupeKey: dedupeKey('telnet', `${session}:${line}`),
  payload: { command: 0, line }, receivedAt: new Date().toISOString(),
});
```

### Comportement face à un champ inconnu

Une réponse du Bridge qui n’est pas un objet JSON se lit comme `{}`.

### Depuis

4.1.9.

<a name="proposedsignal"></a>
<!-- applies: .. since 4.1.9 -->

## `ProposedSignal`

### Forme

`{ source, kind, playerId, sessionId?, dedupeKey, payload, receivedAt }`.

### Valeurs et défaut

- `source` : la famille du connecteur, à titre d’information ; le Bridge vérifie celle du manifeste.
- `kind` : le signal, tel que le jeu le déclare.
- `dedupeKey` : le même fait deux fois a la même clé, `dedupeKey(source, id extérieur)`.
- `payload` : du JSON plat (chaînes, nombres, booléens, null), sans balisage (`<` ni `>`), de `limits.maxBytes` au
  plus. Elle reste dans le connecteur ; le Bridge en reçoit le SHA-256 sur le JSON canonique, en `evidenceHash`.
- `receivedAt` : une heure ISO selon l’horloge du connecteur, envoyée en `occurredAt` (le Bridge pose la sienne).

### Contraintes

Une charge imbriquée, balisée ou trop grosse est refusée (`shape`, `too-large`).

### Exemple minimal

Voir [`ConnectorContext`](#connectorcontext).

### Comportement face à un champ inconnu

Non envoyé : le SDK construit le corps destiné au Bridge à partir des seuls champs ci-dessus.

### Depuis

4.1.9.

<a name="refusalcode"></a>
<!-- applies: .. since 4.1.9 -->

## `RefusalCode`

### Forme

Un vocabulaire fixe, jamais le texte libre du Bridge.

### Valeurs et défaut

| Code | D’où |
|---|---|
| `shape`, `too-large`, `quota`, `not-declared`, `stopped` | Le SDK, avant le Bridge (`shape` aussi pour un 400 du Bridge, `too-large` pour son 413) |
| `denied` | Le 401 ou le 403 du Bridge |
| `revoked` | Le 401 `revoked` du Bridge |
| `player` | Le 404 du Bridge pour un joueur |
| `pairing` | Un code mal formé ; le 404 du Bridge pour un code, 409 ou 410 |
| `pending` | Le 429 `pending` du Bridge (l’arriéré du joueur) |
| `bridge-quota` | Les autres 429 du Bridge |
| `timeout`, `unreachable` | Pas de réponse dans `timeoutMs` ; pas de connexion |
| `bridge` | Un autre statut, ou une 5xx après les nouvelles tentatives |

### Contraintes

Comptés dans `metrics().refused` et journalisés en `signal.refused` avec le code.

### Exemple minimal

`if (!r.ok && r.refusal === 'pending') …` (le joueur a trop de signaux en attente).

### Comportement face à un champ inconnu

Un statut que la table ne nomme pas donne `bridge`.

### Depuis

4.1.9.

<a name="connectorlimits"></a>
<!-- applies: .. since 4.1.9 -->

## `ConnectorLimits`

### Forme

`{ maxBytes, maxPerMinute, timeoutMs }`, les `limits` de la configuration.

### Valeurs et défaut

`maxBytes` 4 096 (une charge en JSON canonique, et la plus grande entrée lue d’un coup), `maxPerMinute` 60
(propositions par minute glissante, tous joueurs confondus ; le Bridge a son propre quota par jeton), `timeoutMs`
5 000 (un appel au Bridge).

### Contraintes

Une limite absente garde sa valeur par défaut.

### Exemple minimal

```json
"limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 }
```

### Comportement face à un champ inconnu

Ignoré.

### Depuis

4.1.9.

<a name="helpers"></a>
<!-- applies: .. since 4.1.9 -->

## Fonctions utilitaires

### Forme

`dedupeKey(source, external)`, `canonicalJson(value)`, `payloadProblem(payload, maxBytes)`, `safeLog(write,
connector)`, `within(work, ms)`, `DRAIN_MS`, `DEFAULT_LIMITS`.

### Valeurs et défaut

- `dedupeKey` : SHA-256 de `<source>:<son id à l’extérieur>`, en hexadécimal.
- `canonicalJson` : du JSON aux clés triées, pour que l’empreinte d’une charge ne dépende pas de l’ordre dans lequel
  elle a été construite.
- `payloadProblem` : `'shape'`, `'too-large'` ou `null`.
- `safeLog` : les nombres et les booléens tels quels ; une chaîne seulement si c’est un identifiant (lettres,
  chiffres, `.`, `_`, `:`, `-`, 64 au plus), jamais avec un `@`, une espace ou une barre oblique ; tout le reste est
  `[redacted]`. Les noms de champ qui ne sont pas des identifiants sont abandonnés.
- `within` : se résout en `done` ou `timeout`, le premier des deux (un vidage ne retient jamais un arrêt plus
  longtemps).

### Contraintes

Aucune.

### Exemple minimal

`dedupeKey('email', messageId)` est la clé du connecteur e-mail.

### Comportement face à un champ inconnu

Sans objet.

### Depuis

4.1.9.

<a name="testing"></a>

## Tester sans réseau

Tout dans le dépôt du moteur, une suite à la fois :

```sh
# dans le dépôt du moteur
npx vitest run tests/connectors-*.test.ts
npm run fuzz:connectors -- --cases=200 --seconds=30 --seed=1
```

- `tests/connectors-*.test.ts` font tourner le même contrat sur les quatre connecteurs contre un vrai Bridge sur un
  port libre (`tests/connectors-sdk.test.ts`), leurs jeux d’essai hostiles (`connectors/test-vectors/`), Telnet et SSH
  sous inondation, avec des clients lents et mille connexions, et les quatre pilotés sous
  `--disallow-code-generation-from-strings`.
- `npm run fuzz:connectors` nourrit les analyseurs des connecteurs de mutations semées de leur corpus
  (`--connector=email|telnet|ssh|open-badge|all`, `--cases` 10 000 par défaut, `--seconds` 60, `--seed`, `--json`).
- Les rejeux enregistrés d’un jeu (`games/<id>/replays/*.json` : des entrées de connecteur et les signaux qu’elles ont
  produits) sont rejoués à travers le vrai code des connecteurs par `tests/connectors-replays.test.ts`, et prouvés
  finissables par `npm run solve:reality`.
- `npm run connector-archive-e2e` joue les quatre depuis l’archive de leur release contre un Bridge venu de la sienne
  (Linux).

> [!GUARANTEE id=bridge-sdk-same-key-one-effect]
> Deux connecteurs qui envoient chacun trois fois la même clé font une seule séquence et un seul effet logique.

<a name="related"></a>

## Identifiants liés

- `quest-n-click-connector`, `npm run connector` : [Vue d’ensemble des connecteurs](bridge.connectors.md#run-one).
- Le côté Bridge d’une proposition : [Garanties](bridge.guarantees.md#duplicates).
- Quels tests tournent et quand : [Quels tests tournent quand](contribute.which-tests.md) ; les tests de mutation des
  connecteurs : [Tests de mutation](contribute.mutation-testing.md).
