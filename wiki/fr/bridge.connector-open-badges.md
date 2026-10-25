# Connecteur Open Badges

Le connecteur Open Badges sert un petit formulaire : un joueur y poste un badge (une assertion Open Badges 2.0 ou un
justificatif 3.0) avec le code d’appairage que montre son jeu, le connecteur vérifie le badge, et le verdict
(`valid`, `invalid`, `expired`, `revoked`, `indeterminate`) propose le signal que le jeu lui associe. Le jeu ne reçoit
jamais le badge. Il est expérimental, comme tous les connecteurs ([Vue d’ensemble des connecteurs](bridge.connectors.md)).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un processus `quest-n-click-connector open-badge` qui répond à `POST /v1/badges`, va chercher les documents du badge
sous une politique réseau stricte, et propose un signal par badge et par verdict.

<a name="context-and-versions"></a>

## Contexte et versions

- Un connecteur à côté d’un Bridge en marche, depuis la 4.1.9. Cette page s’applique à partir de la 4.3.0, version où
  un badge signé avec une clé faible ou étrangère est devenu `invalid` (une preuve `eddsa-jcs-2022` vérifiée avec une
  clé Ed25519 seulement ; RS256 demande un module d’au moins 2 048 bits, ES256 une clé P-256).
- **Vérifié sur : non rejoué pour cette page.** La CI le joue depuis l’archive de la release
  (`npm run connector-archive-e2e`) et contre douze badges d’essai (`tests/connectors-badges.test.ts`) ; personne ne
  lui a encore montré un vrai badge.

<a name="prerequisites"></a>

## Prérequis

- Un Bridge en marche ([Installer et lancer le Bridge](bridge.install-run.md)) et un jeu qui déclare les émetteurs
  auxquels il fait confiance et le signal de chaque verdict ([Signaux et manifeste](bridge.signals-manifest.md#reality-connectors)) :

  ```ts
  'open-badge': { issuers: ['https://badges.example.org/issuer'], valid: 'badge.valid', revoked: 'badge.refused' }
  ```

- Une page à vous qui poste le formulaire vers le connecteur (le connecteur sert la route, pas une page).

<a name="where-to-run"></a>

## Où lancer les commandes

`grant` là où est le dossier du Bridge ; le connecteur derrière votre proxy HTTPS, dans un dossier qui contient sa
configuration et son jeton. `npm run connector -- open-badge …` dans le dépôt du moteur,
`npx quest-n-click-connector open-badge …` avec le paquet.

<a name="steps"></a>

## Étapes

<!-- step: grant -->
1. Donnez au connecteur son jeton, pour les signaux de badge seulement, avec l’appairage :

   ```sh
   # dans le dépôt du moteur (le dossier du Bridge est .cache/bridge)
   npm run bridge -- grant --connector=garden-badges --source=badge --signals=badge.valid,badge.refused --pair > badge.token
   ```

<!-- step: config -->
2. Écrivez sa configuration, `badge.json` ; `hosts` vaut par défaut les hôtes des émetteurs `https:` du jeu :

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "badge.token" },
     "gameId": "signals",
     "health": { "port": 9304 },
     "open-badge": { "port": 8790, "hosts": ["badges.example.org"] }
   }
   ```

<!-- step: run -->
3. Lancez-le :

   ```sh
   # dans le dépôt du moteur
   npm run connector -- open-badge --config badge.json
   ```

   Il refuse de démarrer quand le jeu ne déclare pas de `reality.connectors['open-badge']`.

<!-- step: post -->
4. Un joueur poste, avec un code que le jeu vient de montrer :

   ```sh
   # côté joueur (votre formulaire le fait)
   curl -s -X POST http://127.0.0.1:8790/v1/badges -H 'Content-Type: application/json' \
     -d '{"code":"ABCD2345","badge":"https://badges.example.org/assertions/42","email":"player@example.org"}'
   ```

   `badge` est une URL, un JWS compact, ou le justificatif lui-même ; `email` (ou `recipient`) est ce à quoi on
   compare un destinataire haché. La réponse est `202 {"status":"valid","signal":"accepted"}`, ou
   `200 {"status":"…","signal":"none"}` quand le jeu ne déclare aucun signal pour ce verdict.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET http://127.0.0.1:9304/health` répond 200 `{"connector":"open-badge","ok":true,"detail":"form on port 8790",…}`.
- Le connecteur journalise `"event":"open-badge.verdict"` avec le statut et le format ; le Bridge journalise
  `"event":"pairing.confirmed"`, puis `"event":"signal.accepted"`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Réponse | Cause | Correction |
|---|---|---|
| 422 `{"error":"pairing-pairing"}` | Le code est inconnu, expiré ou déjà utilisé : un code ne sert qu’une fois | Un nouveau code depuis le jeu |
| 400 `{"error":"shape"}` | Pas du JSON, ou pas de `code` | Poster `{ code, badge, email? }` |
| 202 avec `"status":"indeterminate"` | Une suite de preuve qu’il ne sait pas vérifier (`eddsa-rdfc-2022`…), ou un document qu’il n’a pas pu chercher sous sa politique | Demander à l’émetteur un format pris en charge ; vérifier `hosts` |
| 202 avec `"status":"invalid"` | Un autre émetteur que ceux du jeu, un destinataire qui ne correspond pas, une signature mauvaise ou faible | — |
| 413, ou 429 `{"error":"rate"}` | Un corps de plus de 64 Ko ; plus de 30 envois par minute depuis une adresse | — |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Rien sur disque. Les listes de révocation et de statut sont gardées en mémoire un jour au plus.

<a name="recovery"></a>

## Reprise ou retour en arrière

Arrêtez le processus (SIGTERM). Révoquez son jeton sur le Bridge s’il a fuité, et donnez-en un nouveau.

> [!LIMIT id=bridge-badge-code-once]
> Un code d’appairage ne sert qu’une fois. Chaque envoi demande un code que le jeu vient de montrer, et le confirmer
> lie le jeu à un nouveau joueur pseudonyme, comme tout appairage.

<a name="verification"></a>

## Référence : ce qui est vérifié

- **Open Badges 2.0** : hébergé (l’assertion recherchée de nouveau à partir de son propre id) ou signé (un JWS dont
  l’émetteur possède la clé). **3.0** : un VC-JWT, ou une preuve Data Integrity `eddsa-jcs-2022` ; les autres suites,
  comme `eddsa-rdfc-2022`, sont `indeterminate`, jamais `valid`.
- L’émetteur parmi les `issuers` du jeu ; le destinataire contre l’e-mail (haché avec le sel du badge, puis
  abandonné) ; les dates ; la révocation (listes de révocation OB2, `1EdTechRevocationList` OB3 et listes de statut
  Bitstring, gardées un jour au plus).
- Depuis la 4.3.0, une clé trop faible pour son algorithme rend le badge `invalid` (une clé RSA de moins de 2 048 bits,
  une autre courbe que P-256 pour ES256, autre chose qu’Ed25519 pour `eddsa-jcs-2022`).
- La clé est `sha256('open-badge:' + joueur + ':' + id du badge + ':' + verdict)` : le même badge avec le même verdict
  pour le même joueur fait un seul signal.

<a name="network-policy"></a>

## Référence : la politique réseau

Chaque document est cherché sous une seule politique : `https:` seulement ; les hôtes de `hosts` (par défaut les hôtes
des émetteurs) ; le nom résolu une seule fois, et aucune adresse privée, de boucle locale, de lien local, multicast ou
non spécifiée (IPv4, IPv6 et IPv6 mappé IPv4) ; deux redirections au plus, chacune revérifiée ; 64 Ko ; 10 secondes ;
du JSON imbriqué sur 8 niveaux au plus ; `@context` jamais cherché.

> [!GUARANTEE id=bridge-badge-network-policy]
> Une requête sans `https:`, vers un hôte hors liste, avec des identifiants dans son URL, ou dont le nom se résout vers
> une adresse privée est refusée, et un nom n’est résolu qu’une fois (pas de rebinding).

La section `open-badge` :

| Champ | Défaut | Sens |
|---|---|---|
| `port`, `host` | —, `127.0.0.1` | Où écoute `POST /v1/badges` |
| `hosts` | les hôtes des émetteurs `https:` du jeu | D’où les documents peuvent être cherchés |
| `perMinutePerIp` | 30 | Envois par minute et par adresse |
| `maxBytes` | 65 536 | Le corps d’un envoi |

<a name="privacy"></a>

## Ce qu’il garde

Le badge et les documents vers lesquels il pointe sont cherchés, vérifiés puis abandonnés ; seul un verdict sort du
connecteur, sous forme de signal, avec une empreinte de l’id du badge et de l’émetteur en `evidenceHash`. L’e-mail
qu’un joueur donne pour correspondre à un destinataire haché est haché avec le sel du badge pour la comparaison, puis
abandonné : jamais gardé, journalisé ni envoyé. Les listes de révocation et de statut (celles d’un émetteur, pas d’une
personne) sont gardées un jour au plus. Les adresses qui postent sur le formulaire sont comptées en mémoire pendant
une minute (la limite de débit), puis oubliées.

<a name="references"></a>

## Références

- Le code : [`connectors/src/badges/connector.ts`](../../connectors/src/badges/connector.ts),
  [`verify.ts`](../../connectors/src/badges/verify.ts), [`fetch.ts`](../../connectors/src/badges/fetch.ts).
- Le modèle de menace : [`docs/dev/threat-models/open-badge.md`](../../docs/dev/threat-models/open-badge.md).
- Testé par [`tests/connectors-badges.test.ts`](../../tests/connectors-badges.test.ts).
