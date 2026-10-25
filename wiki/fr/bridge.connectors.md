# Vue d’ensemble des connecteurs

Un connecteur transforme quelque chose qui se passe hors du jeu (un e-mail arrive, une commande est tapée dans un
terminal, un badge est présenté) en l’un des signaux que le jeu déclare, et le propose au Reality Bridge. Quatre sont
livrés depuis la 4.1.9, dans le paquet `@quest-n-click/connectors` : **e-mail**, **Telnet**, **SSH** et **Open
Badges**. Cette page dit comment ils sont construits et lancés ; chacun a sa propre page.

<a name="overview"></a>

## Ce qu’est un connecteur

- **Un processus à part**, jamais dans le jeu : le build du jeu ne contient rien de `connectors/` (vérifié par
  `tools/dist.ts`), le jeu ne déclare que des données, et un jeu tourne sans aucun connecteur.
- **Une entrée hostile d’un côté, un signal déclaré de l’autre.** Ce que lit un connecteur est traité comme hostile ;
  chacun a son modèle de menace dans [`docs/dev/threat-models/`](../../docs/dev/threat-models/README.md).
- **Expérimental** (D19) : chaque test de contrat et d’abus tourne en CI, mais personne n’en a encore fait tourner un
  contre un vrai fournisseur d’e-mail, un vrai badge ou un terminal exposé sur un réseau ([Stabilité et support](start.stability.md)).

| Connecteur | Lit | Rattache le joueur par | Sa page |
|---|---|---|---|
| `email` | un message posté par le webhook signé d’un fournisseur, ou relevé en IMAP | une étiquette de destinataire `+p-…`, ou l’expéditeur qui a envoyé un code d’appairage | [E-mail](bridge.connector-email.md) |
| `telnet` | des lignes tapées sur un terminal TCP | le code d’appairage tapé, ou un mot de reprise | [Telnet](bridge.connector-telnet.md) |
| `ssh` | des lignes tapées dans un terminal SSH | un code d’appairage ou un mot de reprise comme mot de passe, ou une clé publique déclarée | [SSH](bridge.connector-ssh.md) |
| `open-badge` | un badge posté sur son formulaire | le code d’appairage posté avec lui | [Open Badges](bridge.connector-open-badges.md) |

<a name="run-one"></a>

## En lancer un

Chaque connecteur a besoin de son propre jeton venu du Bridge, puis de son fichier de configuration :

```sh
# dans le dépôt du moteur (le dossier du Bridge est .cache/bridge)
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
npm run connector -- telnet --config telnet.json
```

```sh
# sur un serveur, avec le paquet @quest-n-click/connectors installé
npx quest-n-click-connector telnet --config telnet.json
```

La commande est `quest-n-click-connector <email|telnet|ssh|open-badge> --config <fichier.json>`. Installez le paquet
sans code natif : `npm install --omit=optional --ignore-scripts @quest-n-click/connectors`. La configuration nomme le
Bridge et le fichier du jeton du connecteur (jamais le jeton sur la ligne de commande), le jeu, ses limites, un port
de santé facultatif, et une section au nom du connecteur :

```json
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
```

- `tokenFile` et les autres chemins sont relatifs au dossier de la configuration. Le manifeste Reality du jeu vient du
  Bridge (`GET /v1/manifest`), ou de `"manifestFile"` ; un manifeste d’un autre jeu que `gameId` l’arrête.
- `limits` (toutes facultatives) : `maxBytes` (une charge en JSON canonique, et la plus grande entrée lue d’un coup ;
  4 096), `maxPerMinute` (propositions par minute, tous joueurs confondus ; 60), `timeoutMs` (un appel au Bridge ;
  5 000).
- Avec `health`, `GET /health` (200 en bonne santé, 503 sinon, avec un `detail`) et `GET /metrics` (les comptes de
  propositions, d’acceptations, de doublons, de refus par code, d’entrées rejetées, de nouvelles tentatives) répondent
  sur `127.0.0.1` (ou `health.host`).
- SIGTERM ou Ctrl-C l’arrête : plus aucune entrée, le travail en cours vidé en cinq secondes au plus, code 0. Sans
  argument, il affiche son usage et sort avec le code 2 ; un connecteur inconnu, code 2.
- Les secrets viennent de fichiers (`secretFile`, `passwordFile`, `tokenFile`, `hostKeyFile`). Un `secret`, un
  `password` ou un `token` en ligne est un raccourci de développement et doit être une chaîne, sinon le connecteur
  refuse de démarrer.

Un jeton créé avec `--pair` peut confirmer les codes d’appairage que donnent les joueurs ; ne donnez à chaque
connecteur que les signaux qu’il propose. Un connecteur vérifie ce qu’il affirme (la preuve d’un badge, l’expéditeur
d’un e-mail) : Biscuit dit seulement qui peut proposer. Côté Bridge, un connecteur utilise trois routes :

- `POST /v1/signals` (jeton en Bearer) `{ playerId, signal, source, dedupeKey, occurredAt?, evidenceHash? }` : 202
  accepté, 200 déjà accepté (la même `dedupeKey`), 401 un jeton mauvais ou révoqué, 403 non autorisé, 404 un joueur
  inconnu ou révoqué, 422 absent du manifeste (ou d’une autre source), 429 au-delà d’un quota.
- `POST /v1/pairings/<code>/confirm` (jeton avec `--pair` en Bearer) : lie le joueur qui montre ce code ; 409 s’il a
  déjà été confirmé.
- `POST /v1/hooks/<source>` avec `X-Web-Scumm-Signature: sha256=<HMAC du corps>` et `{ playerId, event, id }` : le
  webhook de démonstration du Bridge ; `event` doit être l’un de ceux qu’il connaît, `id` nomme la livraison
  (déduplication).

<a name="permissions"></a>

## Déclarer ce que les connecteurs peuvent faire

Le jeu dit, sous forme de données, ce que chaque connecteur peut transformer en signal : `reality.connectors`, vérifié
par `npm run validate`. Chaque signal nommé là est l’un des `reality.signals` ; aucun motif, script ou chemin de
l’auteur n’atteint un connecteur.

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

Chaque champ et ses contraintes : [Signaux et manifeste](bridge.signals-manifest.md#reality-connectors). Deux
autorisations s’empilent : la déclaration du jeu (quels signaux l’entrée d’un connecteur peut devenir) et le jeton du
connecteur (quels signaux, sources et joueurs le Bridge accepte de lui) : [Sécurité](bridge.security.md#biscuit).

Un joueur lie un connecteur à son jeu comme il lie n’importe quel connecteur : la ligne World link du menu pause
affiche un code, et le joueur le tape à l’invite du terminal, l’envoie en sujet d’un e-mail (`PAIR ABCD2345`), ou le
poste avec un badge. Le connecteur le confirme auprès du Bridge ; le jeu est alors lié.

<a name="what-leaves"></a>

## Ce qui sort d’un connecteur

- Le Bridge reçoit le nom du signal, le joueur, la source, la clé de déduplication, l’heure, et le SHA-256 de la charge
  du connecteur (`evidenceHash`) : jamais la charge, le message, la ligne ni le badge.
- La livraison est au moins une fois et appliquée une fois : une proposition dont la réponse s’est perdue est renvoyée
  avec la même clé (deux nouvelles tentatives par défaut) et le Bridge répond `duplicate`. Un refus n’est jamais
  réessayé.
- Le journal d’exécution contient des événements, des identifiants et des comptes. Une chaîne qui ressemble à du
  contenu (une espace, un `@`, une barre oblique) est écrite `[redacted]` ; les tests vérifient qu’aucune adresse,
  aucun texte ni aucun secret des jeux d’essai n’atteint un journal.
- Ce que garde chaque connecteur, et combien de temps : sa propre page, et [Vie privée](play.privacy.md#connectors).

<a name="why"></a>

## Pourquoi

Un connecteur lit des entrées écrites par des inconnus et détient un secret (un mot de passe de boîte mail, une clé
d’hôte). Ni l’un ni l’autre ne doit atteindre le jeu, une PWA sans socket, sans secret et sans contenu exécutable, ni
son DSL. Un processus par connecteur garde une panne ou une compromission à un seul endroit, et un petit SDK fait se
comporter chaque connecteur de la même façon envers le Bridge : les mêmes limites, la même nouvelle tentative avec la
même clé, le même journal qui masque, la même santé et le même arrêt.

<a name="alternatives"></a>

## Les options écartées

- **Le client IMAP habituel** (`imapflow`), avec huit paquets à l’exécution : le connecteur a besoin de sept
  commandes, donc `connectors/src/email/imap.ts` est un client borné à lui, testé contre un serveur scripté.
- **Un analyseur MIME généraliste** : le message est lu par `connectors/src/email/mime.ts` dans un thread de travail
  avec un petit tas et un budget de temps.
- **Du code SSH natif** : `ssh2` (MIT, pur JavaScript) est gardé, ses parties natives facultatives (`cpu-features`,
  `nan`) renvoyées vers un bouchon qui les refuse.
- **Des motifs ou des scripts de l’auteur** : jamais ; le jeu déclare des mots, des commandes, des chemins et des
  émetteurs sous forme de données.

<a name="trade-offs"></a>

## Les compromis

- Un processus de plus par connecteur à lancer, superviser et sécuriser, chacun avec son jeton à renouveler (30 jours
  par défaut).
- Ce qu’un connecteur a vu reste chez lui : un opérateur qui a besoin de l’original (un e-mail, un badge) le garde
  côté source (la boîte mail), pas sur le Bridge.
- Un connecteur ajouté au projet est du code dans `connectors/src/` : [Le SDK des connecteurs](bridge.connector-sdk.md).

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0008](../../docs/dev/adr/0008-connector-sdk.md) : un connecteur est un processus à part, derrière un petit SDK
  (D19).
- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) : Biscuit autorise un connecteur.
- Les modèles de menace : [e-mail](../../docs/dev/threat-models/email.md), [Telnet](../../docs/dev/threat-models/telnet.md),
  [SSH](../../docs/dev/threat-models/ssh.md), [Open Badges](../../docs/dev/threat-models/open-badge.md).
