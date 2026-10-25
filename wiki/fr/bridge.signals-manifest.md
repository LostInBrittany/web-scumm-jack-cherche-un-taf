# Signaux et manifeste

Ce qu’un jeu déclare pour recevoir des signaux du monde extérieur (`reality` dans sa définition), ce que la
construction en fait (le manifeste Reality que vérifie le Bridge), et ce que contient un signal signé. Pour les
auteurs ; la référence de chaque champ. Un signal est un identifiant pris dans une liste finie que le jeu déclare, et
il arrive dans le jeu comme l’événement du même nom : rien de l’extérieur n’atteint le jeu à part cet identifiant, ni
texte, ni adresse, ni charge, si bien que rien de l’extérieur ne peut injecter une réplique, un drapeau ou du HTML.

Une déclaration complète, de la famille du jeu d’exemple (`games/signals/game.ts` est la vraie) :

```ts
reality: {
  bridge: 'https://bridge.example/',          // le Bridge auquel se lie le menu pause (http://127.0.0.1 en développement)
  signals: [
    { id: 'mail.answer.correct', source: 'mail', availability: 'required', replay: 'record',
      fallback: { verb: 'use', a: 'radio' } },  // ce que fait un joueur quand l'extérieur ne répond jamais
    { id: 'mail.answer.wrong', source: 'mail', availability: 'optional', replay: 'record' },
    { id: 'hook.bell', source: 'webhook', availability: 'optional', replay: 'record', once: false },
  ],
},
events: [
  { id: 'mail-opens-gate', on: 'mail.answer.correct', do: [{ set: 'gate_open' }, 'Une lettre : « Oui. »'] },
],
```

<a name="reality-bridge"></a>
<!-- applies: .. since 4.1.1 -->

## `reality.bridge`

### Forme

Une URL, une chaîne.

### Valeurs et défaut

Le Reality Bridge auquel se lie la ligne **World link** du menu pause : `https://…`, ou `http://127.0.0.1` ou
`http://localhost` (avec un port) en développement. Absent : les signaux n’atteignent le jeu que par le simulateur du
Studio. C’est public, pas un secret.

### Contraintes

`npm run validate` refuse un autre schéma ou un autre hôte : `reality.bridge: "<url>": an https:// URL (http:// only
for 127.0.0.1 or localhost)`.

### Exemple minimal

```ts
reality: { bridge: 'https://bridge.example.org/', signals: [/* … */] }
```

### Comportement face à un champ inconnu

Voir [`reality.signals`](#reality-signals).

### Depuis

4.1.1.

<a name="reality-signals"></a>
<!-- applies: .. since 4.1.1 -->

## `reality.signals`

### Forme

Un tableau de signaux ; chacun est `{ id, source, availability, replay, once?, fallback? }`.

### Valeurs et défaut

- **`id`** : le signal, et l’événement qu’il émet. Lettres, chiffres et `. _ : -`, 128 caractères au plus
  (`mail.answer.correct`).
- **`source`** : d’où il vient, la famille d’un connecteur (`mail`, `webhook`, `email`, `terminal`, `badge`…). Le
  jeton d’un connecteur nomme les sources qu’il peut proposer, et le Bridge refuse un signal proposé sous une autre
  source (422 `source`).
- **`availability`** : `optional`, ou `required` quand la fin principale en a besoin.
- **`replay`** : `record`, le seul mode : le signal est une entrée de la session, rejouée hors ligne.
- **`once`** (par défaut `true`) : l’effet du signal s’exécute une fois par partie, quel que soit le nombre de ses
  arrivées. `false` : chaque signal distinct venu du Bridge le relance ; une livraison répétée du même ne le relance
  jamais.
- **`fallback`** : pour un signal `required`, l’action qu’un joueur peut faire à la place, `{ verb, a, b?, do? }`.

### Contraintes

`npm run validate` dit, pour `reality.signals[<i>]` :

- `signal id "<id>": letters, digits and . _ : - only, at most 128` ; `signal "<id>" is declared twice` ;
- `a signal names its \`source\` (mail, webhook…)` ;
- `\`availability\` is "optional" or "required"` ; `\`replay\` is "record" (the only mode of 4.1.1)` ;
- `required signal "<id>" has no \`fallback\`: what a player does when the outside never answers`, ou `the fallback
  of "<id>" (<verb> <a>) matches no rule` ;
- un avertissement, `signal "<id>" is declared but nothing listens to it`.

Dans un jeu avec `reality`, un événement écouté que rien n’émet ni ne déclare est une erreur (`event "<ev>" is never
emitted nor declared in reality.signals`) : une faute de frappe attendrait sinon pour toujours un signal que le Bridge
refuse. Un signal `required` demande aussi un scénario qui l’envoie, et le jeu doit pouvoir se finir sans l’extérieur :
le lint du contenu vérifie que le témoin du monde fermé joue la solution de repli
([Garanties](bridge.guarantees.md#proof)).

### Exemple minimal

```ts
reality: {
  signals: [{ id: 'hook.bell', source: 'webhook', availability: 'optional', replay: 'record' }],
},
events: [{ id: 'bell-rings', on: 'hook.bell', do: ['Quelque part, une cloche.'] }],
```

### Comportement face à un champ inconnu

Le validateur ne le regarde pas, et TypeScript le refuse quand le jeu est typé `GameDef` (`npm run check`). Le
manifeste ne garde que `id`, `source`, `availability` et `replay` de chaque signal : rien d’autre n’atteint le Bridge.

### Depuis

4.1.1.

<a name="reality-connectors"></a>
<!-- applies: .. since 4.1.9 -->

## `reality.connectors`

### Forme

Un objet, `{ email?, telnet?, ssh?, 'open-badge'? }` : ce que chaque connecteur peut transformer en signal, sous forme
de données. Public : il entre dans le manifeste.

### Valeurs et défaut

- **`email`** : `{ answers: [{ words: string[], signal }], otherwise? }`. La première réponse dont tous les mots
  figurent dans le sujet ou le texte (mots entiers, casse indifférente) propose son signal ; sinon `otherwise`.
- **`telnet`** : `{ banner?, prompt?, commands: [{ says, reply, signal? }] }`. `says` est comparé en entier, jamais
  comme un motif ; `reply` est affiché en retour ; une commande sans `signal` ne fait que répondre.
- **`ssh`** : la même chose, plus `files` : le disque virtuel, `{ "/notes/lamp.txt": "texte" }`, lu avec `ls`, `cd`,
  `cat`.
- **`'open-badge'`** : `{ issuers: string[], valid, invalid?, expired?, revoked?, indeterminate? }` : les émetteurs
  dont les badges comptent, et le signal de chaque verdict.

```ts
reality: {
  signals: [
    { id: 'letter.door', source: 'email', availability: 'optional', replay: 'record' },
    { id: 'terminal.lamp', source: 'terminal', availability: 'optional', replay: 'record' },
  ],
  connectors: {
    email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' },
    telnet: { prompt: 'shed> ', commands: [{ says: 'lamp on', reply: 'Clic.', signal: 'terminal.lamp' }] },
    ssh: { commands: [/* les mêmes */], files: { '/notes/lamp.txt': 'La lampe obéit à deux mots.' } },
    'open-badge': { issuers: ['https://badges.example.org/issuer'], valid: 'badge.valid', revoked: 'badge.refused' },
  },
}
```

### Contraintes

Vérifiées par `npm run validate` ; chaque signal nommé est l’un des `reality.signals` (`signal "<id>" is not declared
in reality.signals`) :

- `email.answers[].words` : un ou plusieurs, chacun de 1 à 64 lettres ou chiffres, sans espace ;
- `commands[].says` de `telnet` et `ssh` : des mots en minuscules de lettres, chiffres et `-`, séparés par une espace
  (8 mots de 32 caractères au plus) ; ni `help`, `exit`, `quit`, `clear`, `ls`, `cd`, `cat` ou `pwd` (les commandes
  propres au terminal) ; pas deux fois. `reply` : du texte simple, 2 000 caractères au plus ;
- `ssh.files` : des chemins absolus de noms simples, sans `.` ni `..`, 8 niveaux au plus ; 16 Ko de texte au plus
  chacun ;
- `open-badge.issuers` : un ou plusieurs identifiants d’émetteur (URL ou DID), 512 caractères au plus chacun.

Aucun motif, script ou chemin de l’auteur n’atteint un connecteur.

### Exemple minimal

```ts
connectors: { telnet: { commands: [{ says: 'lamp on', reply: 'Clic.', signal: 'terminal.lamp' }] } }
```

### Comportement face à un champ inconnu

Gardé tel quel dans le manifeste, et ignoré par les connecteurs, qui ne lisent que les champs ci-dessus.

### Depuis

4.1.9. Chaque connecteur : [Vue d’ensemble des connecteurs](bridge.connectors.md).

<a name="scenarios"></a>
<!-- applies: .. since 4.1.1 -->

## `reality/scenarios/*.json`

### Forme

Un fichier JSON par scénario dans `games/<id>/reality/scenarios/` (dans un projet créé, le dossier
`reality/scenarios/` du jeu) : `{ "signals": ["<id>", …] }`.

### Valeurs et défaut

Les signaux que le monde envoie, dans cet ordre, chacun pouvant arriver à n’importe quel moment après le précédent.
`npm run solve:reality` prouve le jeu dans chaque scénario, puis dans chaque rejeu enregistré par les connecteurs
(`games/<id>/replays/*.json`, leurs `signals` dans l’ordre), ainsi que dans les mondes fermé et adverse.

### Contraintes

Chaque signal est un signal déclaré (`scenario <nom>: "<id>" is not declared`). Quand le jeu a des signaux
`required`, au moins un scénario les envoie tous (`no scenario sends every required signal (…): add one in
reality/scenarios/`).

### Exemple minimal

```json
{ "signals": ["mail.answer.wrong", "mail.answer.correct"] }
```

### Comportement face à un champ inconnu

Seul `signals` est lu.

### Depuis

4.1.1.

<a name="reality-manifest"></a>
<!-- applies: .. since 4.1.1 -->

## Le manifeste Reality (`dist/reality-manifest.json`)

### Forme

```json
{
  "format": "web-scumm-reality-manifest",
  "schema": 1,
  "gameId": "signals",
  "signals": [{ "id": "hook.bell", "source": "webhook", "availability": "optional", "replay": "record" }],
  "connectors": { "telnet": { "commands": [] } }
}
```

### Valeurs et défaut

Fait à partir du contenu du jeu : `npm run build` l’écrit dans `dist/reality-manifest.json` quand le jeu déclare
`reality`, et `npm run bridge -- init` le lit dans le contenu. Les signaux sont triés par identifiant ; `connectors`
n’est présent que si le jeu le déclare. Il ne contient aucun secret. Son empreinte, `manifestHash`, est le SHA-256 de
son JSON, clés dans cet ordre fixe, en hexadécimal.

### Contraintes

Le Bridge garde l’empreinte dans son `config.json` et refuse de démarrer sur un autre manifeste : `the game's manifest
(…) is not the one configured (…)`, si bien qu’une vieille configuration ne peut pas publier un signal que le jeu a
renommé ou retiré. Il répond à `GET /v1/manifest` par `{ manifest, hash }` ; un connecteur le lit là, ou dans son
`manifestFile`.

### Exemple minimal

Le Bridge autonome part de lui : `npx quest-n-click-bridge init --manifest=<game>/dist/reality-manifest.json`.

### Comportement face à un champ inconnu

Le manifeste est fabriqué, pas écrit à la main ; les champs d’un signal au-delà des quatre sont laissés de côté.

### Depuis

4.1.1 ; `connectors` depuis la 4.1.9.

<a name="world-signal"></a>
<!-- applies: .. since 4.1.1 -->

## Le signal signé (`WorldSignalV1`, `WorldSignalV2`)

### Forme

Un JWS compact (`alg: EdDSA`, un `kid` qui nomme la clé), de `MAX_SIGNAL_CHARS` (4 096) caractères au plus. Le joueur
vérifie la signature sur les octets exacts avant de les lire.

### Valeurs et défaut

Les deux versions : `format` (`web-scumm-world-signal`), `schema` (1 ou 2), `id` (unique par signal sur le Bridge),
`sequence` (par joueur, depuis 1), `gameId`, `playerId`, `signal`, `source`, `occurredAt?` (l’heure du connecteur, à
titre d’information), `receivedAt`, `expiresAt?`, `dedupeKey`, `policyVersion`, `evidenceHash?` (un SHA-256 de ce que
le connecteur a vu, jamais la pièce elle-même). La V2 ajoute `tenantId`, `environment` (`prod`, `staging`, `dev`),
`audience` (l’origine depuis laquelle le joueur s’est appairé, ou l’audience du Bridge), `sessionId` (le lien) et
`keyId` (égal au `kid` de l’en-tête).

### Contraintes

Le joueur vérifie la taille, l’algorithme, la clé (chacune dans sa fenêtre), la signature, puis le jeu, le joueur, le
manifeste et l’expiration (cinq minutes de tolérance pour l’horloge de l’appareil), et pour la V2 le contexte
(`audience-mismatch`). Un refus a un code (14 en tout, `RefusalCode`). Un Bridge à plusieurs tenants ne signe que du
V2 ; un Bridge à un seul tenant signe du V1 sauf si sa configuration dit `signalVersion: 2` ; le joueur accepte les
deux par défaut.

### Exemple minimal

Ce que la session en garde : `{ external: { id, sequence, signal, source, receivedAt, playerId } }`.

### Comportement face à un champ inconnu

Refusé : les deux charges sont des schémas stricts.

### Depuis

V1 en 4.1.1 ; V2 en 4.1.10 (ADR 0010).

<a name="related"></a>

## Identifiants liés

- Le module `@quest-n-click/engine/reality` (`verifySignal`, `RealityClient`, `httpPort`, `SignalSimulator`,
  `realityManifest`, `manifestHash`, `verifyDayToken`…), pour un jeu qui a son propre transport (`WorldSignalPort`) :
  [API publique](engine.api.md#reality).
- Les textes d’interface du lien au monde (`realityLink`…) : [Démarrage rapide](bridge.quick-start.md#player).
- `npm run validate`, `npm run solve:reality`, `npm run lint` : [Vérifier son jeu](create.checking.md).
- Le jeu d’exemple : `games/signals/` ([Jeux d’exemple](create.example-games.md)).
