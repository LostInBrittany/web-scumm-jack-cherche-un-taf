# Connecteur e-mail

Le connecteur e-mail transforme une lettre en signal : un joueur répond au jeu par e-mail, et les mots de sa réponse
proposent le signal que le jeu leur associe. Il lit les messages depuis le webhook signé d’un fournisseur ou depuis une
boîte qu’il relève en IMAP, et n’envoie aucune réponse. Il est expérimental, comme tous les connecteurs ([Vue d’ensemble des connecteurs](bridge.connectors.md)).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un processus `quest-n-click-connector email` qui lie un joueur par un code d’appairage envoyé en sujet d’un e-mail,
puis propose `letter.door` (ou le signal que le jeu déclare) pour chaque message dont les mots correspondent à une
réponse, une fois par message : un message livré deux fois fait un seul signal.

<a name="context-and-versions"></a>

## Contexte et versions

- Un connecteur à côté d’un Bridge en marche, depuis la 4.1.9 ; cette page s’applique à partir de la 4.2.5 (le nom
  `quest-n-click-connector`).
- **Vérifié sur :** le mode webhook, comme dans les étapes ci-dessous, a été lancé le 23 octobre 2026 contre un Bridge
  local du jeu `signals` (macOS, Node 22.14, moteur 4.4.0) : une lettre d’appairage `202 {"status":"paired"}`, une
  réponse `202 {"status":"accepted"}`, la même réponse de nouveau `200 {"status":"duplicate"}`. Le mode IMAP n’a pas
  été rejoué pour cette page ; la CI joue les deux modes depuis l’archive de la release (`npm run connector-archive-e2e`),
  contre un petit serveur IMAP à elle, jamais un vrai fournisseur.

<a name="prerequisites"></a>

## Prérequis

- Un Bridge en marche ([Installer et lancer le Bridge](bridge.install-run.md)), et un jeu dont
  `reality.connectors.email` déclare ses réponses ([Signaux et manifeste](bridge.signals-manifest.md#reality-connectors)) :

  ```ts
  connectors: { email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' } }
  ```

- Pour le mode webhook : un fournisseur (ou un petit adaptateur devant lui) capable de poster le message brut, signé
  comme plus bas. Pour le mode IMAP : une boîte joignable en TLS, et son mot de passe dans un fichier.

<a name="where-to-run"></a>

## Où lancer les commandes

`grant` là où est le dossier du Bridge ; le connecteur sur la machine qui reçoit le webhook ou atteint la boîte, dans
un dossier qui contient sa configuration, son jeton et son secret (mode 600). `npm run connector -- email …` dans le
dépôt du moteur, `npx quest-n-click-connector email …` avec le paquet `quest-n-click-connectors`.

<a name="steps"></a>

## Étapes

<!-- step: grant -->
1. Donnez au connecteur son jeton, pour les signaux e-mail seulement, avec l’appairage :

   ```sh
   # dans le dépôt du moteur (le dossier du Bridge est .cache/bridge)
   npm run bridge -- grant --connector=gate-mail --source=email --signals=letter.door,letter.unclear --pair > email.token
   ```

<!-- step: secret -->
2. Écrivez le secret partagé du webhook dans un fichier (ou, pour IMAP, le mot de passe de la boîte) :

   ```sh
   # dans le dossier du connecteur
   node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > webhook.secret
   chmod 600 webhook.secret
   ```

<!-- step: config -->
3. Écrivez sa configuration, `email.json`. Le mode webhook :

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "email.token" },
     "gameId": "signals",
     "health": { "port": 9302 },
     "email": { "mode": "webhook", "domain": "game.example.org", "webhook": { "port": 8789, "secretFile": "webhook.secret" } }
   }
   ```

   Ou le mode IMAP :

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "email.token" },
     "gameId": "signals",
     "email": { "mode": "imap", "imap": { "host": "imap.example.org", "user": "gate@example.org", "passwordFile": "imap.password", "pollS": 60 } }
   }
   ```

<!-- step: run -->
4. Lancez-le :

   ```sh
   # dans le dépôt du moteur
   npm run connector -- email --config email.json
   ```

   Il journalise `{"event":"email.started","connector":"email","mode":"webhook"}`.

<!-- step: try -->
5. Essayez le webhook avec un envoi signé. La signature est `sha256=` suivi du HMAC-SHA256, sous le secret, de
   `<horodatage>.<message brut>` ; l’horodatage est en secondes Unix, à moins de cinq minutes de l’horloge du
   connecteur :

   ```sh
   # dans le dossier du connecteur, answer.eml contenant un message brut (en-têtes, une ligne vide, le texte)
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

   Un message dont le sujet est `PAIR ABCD2345` (le code que montre le jeu) lie son expéditeur :
   `202 {"status":"paired"}`. Un message suivant du même expéditeur qui dit « open the door » :
   `202 {"status":"accepted"}`. Le même message de nouveau : `200 {"status":"duplicate"}`.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET http://127.0.0.1:9302/health` répond 200 `{"connector":"email","ok":true,"detail":"webhook on port 8789",…}`
  (ou `"mailbox polled"`) ; `GET /metrics` compte les propositions, acceptations, doublons, refus et entrées rejetées.
- Le Bridge journalise `"event":"pairing.confirmed"`, puis `"event":"signal.accepted"` avec le signal.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `email: "mode" is "webhook" or "imap"` au démarrage | Pas de mode | Définir `email.mode` |
| `email: webhook mode needs "webhook.secretFile"` / `email: imap mode needs "imap.passwordFile"` | Le secret manque | Nommer son fichier |
| `email: "imap.tls": false is allowed for a loopback host only (127.0.0.1, ::1, localhost)` | TLS coupé vers un serveur distant | Garder TLS |
| 401 `{"error":"stale"}` | L’horodatage manque ou est à plus de cinq minutes | Envoyer des secondes Unix ; vérifier les horloges |
| 401 `{"error":"signature"}` | Un autre secret, ou le corps a changé en route | Signer les octets exacts envoyés |
| 422 `{"error":"no-player"}` | L’expéditeur n’a envoyé aucun code d’appairage, et aucune étiquette de destinataire de `domain` ne nomme un joueur | S’appairer d’abord, ou définir `domain` |
| 422 `{"error":"attachment"}` / `"too-large"` / `"unreadable"` | Un message avec pièce jointe, de plus de 256 Ko, ou refusé par le lecteur | Du texte simple, sans pièce jointe |
| 422 `{"error":"pairing-pairing"}` | Le code d’appairage est inconnu, expiré ou déjà confirmé | Un nouveau code depuis le jeu |
| 429 `{"error":"rate"}` | Plus de 120 envois par minute depuis une adresse | Ralentir |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- Mode webhook : rien d’écrit ; le message est lu en mémoire puis abandonné.
- Mode IMAP : des drapeaux dans la boîte. Avec `keepDays: 0` (par défaut), un message est supprimé dès que son signal
  est accepté (ou trouvé déjà accepté) ; avec `keepDays: N`, au bout de N jours. Un message refusé pour de bon est
  signalé (`\Flagged`) et gardé pour l’opérateur. Un message refusé pour une raison passagère (le Bridge absent ou
  occupé, un quota) reste non lu et est relu au relevé suivant.

> [!GUARANTEE id=bridge-email-unseen-when-away]
> Un message dont le signal n’a pas pu atteindre le Bridge (Bridge absent) reste non lu et est relu par un relevé
> suivant ; un message refusé pour de bon est signalé.

<a name="recovery"></a>

## Reprise ou retour en arrière

Arrêtez le processus (SIGTERM). Révoquez son jeton sur le Bridge (`revoke --token=<id de révocation>`) s’il a fuité,
et donnez-en un nouveau. Rien dans le jeu ne dépend du connecteur : un jeu où `letter.door` est facultatif continue
sans lui.

<a name="configuration"></a>

## Référence de la configuration

La section `email` :

| Champ | Défaut | Sens |
|---|---|---|
| `mode` | (obligatoire) | `webhook` ou `imap` |
| `domain` | aucun | Le domaine des adresses par joueur `<boîte>+p-<16 hex>@<domaine>` ; sans lui, les étiquettes ne sont pas lues |
| `maxBytes` | 262 144 (256 Ko) | Le plus gros message brut lu ; jamais plus de 4 Mo, quoi qu’il dise |
| `linkDays` | 30 | Combien de temps un expéditeur qui a envoyé un code d’appairage reste lié à son joueur, en mémoire |
| `webhook.port`, `webhook.host` | —, `127.0.0.1` | Où écoute `POST /v1/inbound` |
| `webhook.secretFile` | (obligatoire) | Le fichier du secret HMAC |
| `webhook.toleranceS` | 300 | L’écart permis entre l’horodatage et maintenant, en secondes |
| `webhook.perMinutePerIp` | 120 | Envois par minute et par adresse |
| `imap.host`, `imap.port` | —, 993 | Le serveur de la boîte, en TLS |
| `imap.user`, `imap.passwordFile` | (obligatoires) | Son identifiant |
| `imap.mailbox` | `INBOX` | Le dossier relevé |
| `imap.tls` | `true` | `false` seulement vers cette machine |
| `imap.pollS` | 60 | Secondes entre deux relevés (50 messages non lus au plus chacun) |
| `imap.keepDays` | 0 | 0 : supprimer une fois accepté ; N : garder N jours |

<a name="reading"></a>

## Comment un message est lu

- Dans un thread de travail avec un tas de 64 Mo et 2 secondes ; 256 Ko au plus, 3 niveaux de multipart, 64 parties,
  200 en-têtes ; le HTML devient du texte inerte ; un message avec pièce jointe est refusé ; un message sans
  `Message-ID` est refusé.
- Le joueur est l’étiquette du destinataire (`gate+p-…@<domaine>`, avec `domain` défini) ou l’expéditeur qui a envoyé
  un code d’appairage (sujet `PAIR ABCD2345`, `LINK …`, `CODE …` ou le code seul).
- La première réponse dont tous les mots figurent dans le sujet ou le texte (mots entiers, casse indifférente)
  propose son signal, sinon `otherwise`.
- La clé est `sha256('email:' + Message-ID)` : un message livré deux fois fait un seul signal. La charge est une
  empreinte du `Message-ID` et du numéro de la réponse, empreinte reprise en `evidenceHash`.
- Aucune réponse n’est envoyée.

<a name="privacy"></a>

## Ce qu’il garde

- **Mode webhook :** rien ; le message est lu en mémoire puis abandonné.
- **Mode IMAP :** le message reste dans la boîte de l’opérateur, là où il est arrivé, jusqu’à ce que `keepDays` le
  supprime ; un message refusé reste signalé jusqu’à ce que l’opérateur le supprime.
- Un expéditeur qui a envoyé un code d’appairage est retenu sous la forme d’un SHA-256 salé de son adresse (le sel est
  aléatoire et vit aussi longtemps que le processus) associé au `playerId`, en mémoire, pendant `linkDays` ; un
  redémarrage l’oublie.
- L’adresse, le sujet et le texte ne sont jamais journalisés ni envoyés au Bridge.

<a name="references"></a>

## Références

- Le code : [`connectors/src/email/connector.ts`](../../connectors/src/email/connector.ts),
  [`imap.ts`](../../connectors/src/email/imap.ts), [`mime.ts`](../../connectors/src/email/mime.ts).
- Le modèle de menace : [`docs/dev/threat-models/email.md`](../../docs/dev/threat-models/email.md).
- Testé par [`tests/connectors-email.test.ts`](../../tests/connectors-email.test.ts).
