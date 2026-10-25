# Sécurité : Biscuit et signatures

Comment le Reality Bridge décide qui peut proposer un signal, comment un joueur sait que le Bridge l’a accepté, quels
secrets existent et où ils vivent, comment les clés tournent et les jetons sont révoqués, et que faire quand l’un
d’eux fuit. Deux mécanismes, chacun pour une question : **Biscuit** dit qui peut proposer quoi, sur le Bridge
seulement ; une **signature Ed25519** dit ce que le Bridge a accepté, vérifiée par le joueur.

<a name="secrets"></a>

## Les secrets et où ils vivent

| Secret | Où | Qui le lit | S’il fuit |
|---|---|---|---|
| La moitié privée de la racine Biscuit | `root.key` (mode 600) | `grant` seulement ; `serve` ne la charge jamais | N’importe qui peut fabriquer des jetons de connecteur : [une nouvelle racine](#procedures) |
| La clé qui signe les événements (Ed25519) | `config.json` (`eventKey`, mode 600) | `serve` | N’importe qui peut signer des signaux que les joueurs acceptent : [la faire tourner](#procedures) |
| Le jeton de l’opérateur | `admin-token` (seule copie en clair) ; son SHA-256 dans `config.json` | `revoke`, les routes `/v1/admin/*` | N’importe qui peut exporter, supprimer et révoquer. Aucune commande ne le remplace seul : en créer un avec `init` dans un dossier de travail, copier son `adminTokenHash` dans `config.json` et son `admin-token` à côté, redémarrer |
| Le Biscuit d’un connecteur | le `tokenFile` du connecteur | ce connecteur | Le révoquer par son id, en donner un nouveau |
| Le secret et le jeton d’un webhook de démonstration | `config.json` (`webhooks`) | `serve` | Refaire `init`, ou ne jamais les activer sur Internet (`--no-demo-webhooks`) |
| La capacité d’un joueur | le navigateur du joueur (`localStorage`) ; son SHA-256 sur le Bridge | la page du joueur | Révoquer le lien du joueur |
| L’URL et le mot de passe de la base | `BRIDGE_STORE` ou `BRIDGE_STORE_FILE`, jamais le fichier | `serve` et les commandes | Changer le mot de passe |

Gardez `root.key` là où le Bridge n’est pas, si vous le pouvez : un Bridge qui ne fait que servir n’en a pas besoin.

<a name="biscuit"></a>

## Biscuit : qui peut proposer quoi

Le jeton d’un connecteur est fabriqué par `grant` à partir de la clé racine. Son bloc d’autorité nomme le jeu, les
sources, les signaux, les joueurs (ou n’importe quel joueur du jeu), l’audience du Bridge, le tenant (depuis la
4.1.10), s’il peut confirmer des codes d’appairage (`--pair`), et une expiration à la seconde (refusé à partir de
cette seconde). Le Bridge vérifie chaque proposition contre
[`bridge/policy/propose.datalog`](../../bridge/policy/propose.datalog), et chaque confirmation d’appairage contre
[`pair.datalog`](../../bridge/policy/pair.datalog), en 200 ms au plus de temps d’exécution Biscuit.

- Un connecteur peut atténuer son propre jeton (moins de joueurs, une expiration plus proche) avant de le transmettre ;
  il ne peut jamais l’élargir.
- Chaque jeton a des identifiants de révocation ; révoquer n’importe lequel fait refuser le jeton.
- L’ordre des vérifications ne trahit rien : le manifeste répond d’abord (il est public), puis le jeton, avant qu’aucun
  joueur ne soit nommé, si bien qu’un appelant sans jeton valide n’apprend rien des joueurs qui existent (un 401 ou un
  403 avant toute 404).
- Une adresse qui rate 60 authentifications en une minute voit toutes ses requêtes refusées pendant un moment (429).
- Biscuit dit seulement qui peut proposer. Un connecteur vérifie lui-même ce qu’il affirme : la preuve d’un badge,
  l’expéditeur d’un e-mail.

> [!GUARANTEE id=bridge-bad-token-before-player]
> Un mauvais jeton est refusé avant qu’un joueur inconnu ne soit nommé, et une adresse à court d’authentifications
> ratées attend.

<a name="signatures"></a>

## Signatures : ce que le Bridge a accepté

Le Bridge signe chaque signal accepté sous forme de JWS compact (`alg: EdDSA`, un `kid` qui nomme la clé). Le joueur
vérifie la signature sur les octets exacts qu’il a reçus avant de les lire, puis la taille, la fenêtre de la clé, le
jeu, le joueur, le manifeste et l’expiration, avec cinq minutes de tolérance pour l’horloge de l’appareil. Le joueur
ne détient ni Biscuit ni clé : seulement une capacité qui lit et acquitte ses propres signaux.

Un `WorldSignalV2` nomme aussi son tenant, son environnement, l’origine depuis laquelle le joueur s’est appairé, le
lien et la clé, si bien qu’un signal signé pour un contexte est refusé dans un autre (`audience-mismatch`), même quand
deux tenants ont reçu (à tort) la même clé. Un Bridge qui sert plusieurs tenants ne signe que du V2, et liste ses
clés avec leur tenant ; un Bridge à un seul tenant signe du V1 sauf si sa configuration dit `signalVersion: 2`
(`init --signal-version=2`). Le joueur accepte les deux par défaut. Chaque champ :
[Signaux et manifeste](bridge.signals-manifest.md#world-signal).

Le webhook de démonstration (`POST /v1/hooks/<source>`) s’authentifie autrement : un HMAC-SHA256 du corps brut sous
le secret du webhook, dans `X-Web-Scumm-Signature: sha256=<hex>`, comparé en temps constant.

<a name="keys"></a>

## Clés et rotation

La clé d’événements signe chaque signal avec son `kid` ; le joueur fait confiance aux clés que liste `GET /v1/keys`,
chacune dans sa fenêtre.

```sh
# dans le dépôt du moteur (le dossier du Bridge)
npm run bridge -- rotate --keep-days=30
```

`rotate` crée une nouvelle clé et garde l’actuelle dans `previousKeys` pendant `--keep-days` jours ; redémarrez
ensuite le Bridge. Dès lors, le Bridge livre chaque signal sous sa clé actuelle : ce qui attendait un joueur est
re-signé à la livraison (le stockage garde la charge telle qu’acceptée), et un joueur dont le lien était ouvert
redemande les clés une fois quand un signal en nomme une qu’il ne connaît pas. `--keep-days` n’a qu’à couvrir un
joueur qui a reçu un signal juste avant la rotation et le vérifie après.

> [!LIMIT id=bridge-rotation-resets-run-quota]
> Les compartiments de débit des classements de speedrun sont indexés par un HMAC dérivé de la clé d’événements : la
> faire tourner fait repartir chaque client sur un nouveau compartiment (au plus une minute de quota en plus).

La clé racine Biscuit fabrique les jetons des connecteurs : la faire tourner, c’est redonner un nouveau jeton à chaque
connecteur.

<a name="revocation"></a>

## Révocation

```sh
# dans le dépôt du moteur, le Bridge en marche
npm run bridge -- revoke --url=<bridge> --player=<p-…>           # le lien d'un joueur
npm run bridge -- revoke --url=<bridge> --token=<revocation id>  # le jeton d'un connecteur (n'importe lequel de ses ids de révocation)
```

Les flux d’un joueur révoqué se terminent aussitôt, et ses propositions sont refusées, y compris une qui chevauche la
révocation (le joueur et le jeton sont revérifiés dans l’étape par joueur). Un joueur peut révoquer son propre lien :
« Unlink » dans le menu pause (`POST /v1/unlink`). Une capacité finit aussi d’elle-même : 30 jours après son dernier
accusé de réception, 180 jours au plus après son appairage.

<a name="procedures"></a>

## Procédures

**La clé d’événements d’un tenant compromise.** `rotate --dir=<tenant>`, puis retirez la clé compromise de
`previousKeys` dans le `config.json` de ce tenant, et redémarrez ses instances. Les joueurs refusent dès lors ce
qu’elle a signé ; ce qui les attend est re-signé sous la nouvelle clé à la livraison. Les autres tenants ne sont pas
touchés.

**Une racine Biscuit compromise.** `init --force` en fait trop. Créez une nouvelle racine (`init` dans un dossier de
travail, copiez son `biscuitRoot` dans `config.json` et son `root.key`), redonnez un jeton à chaque connecteur du
tenant, redémarrez, puis révoquez les identifiants des anciens jetons (`revoke --token=`) pour la période d’avant le
redémarrage.

**Une instance ou son hôte compromis.** Elle détenait toutes les clés privées des tenants qu’elle servait : faites
tourner la clé d’événements de chaque tenant, créez à chaque tenant une nouvelle racine, changez le mot de passe de la
base et les jetons d’opérateur, et lisez la quarantaine du stockage (`doctor`) et les journaux depuis la
compromission.

**La rotation, en routine.** Par tenant, à son rythme : `rotate --dir=<tenant> --keep-days=30`, puis redémarrez ses
instances une à une (les autres continuent de servir ; le stockage est le même).

<a name="why"></a>

## Pourquoi

Un signal passe par trois mains : un connecteur, le Bridge, le navigateur du joueur. Chacune doit pouvoir vérifier la
précédente, et un jeton volé à une étape ne doit pas ouvrir les autres. Le Biscuit d’un connecteur n’ouvre rien côté
joueur ; la capacité d’un joueur ne propose rien ; la clé d’événements signe mais n’autorise aucun connecteur.

<a name="alternatives"></a>

## Les options écartées

- **COSE** pour le signal signé : un décodeur CBOR dans le joueur, pour rien qu’un JWS n’offre déjà ici ; la solution
  de repli si un navigateur pris en charge abandonne Ed25519 (D15).
- **Biscuit dans le joueur** : le joueur détient plutôt une capacité étroite (D16).
- **Des clés par tenant dérivées par construction** : le joueur ne peut pas vérifier une dérivation dont il ne détient
  pas la racine ; un signal nomme plutôt son contexte (ADR 0010).

<a name="trade-offs"></a>

## Les compromis

Deux formats à maintenir, des clés à faire tourner, et une vérification croisée de Biscuit en Rust dans la CI
(`npm run reality:xcheck` : la version WebAssembly utilisée en production et la crate Rust doivent s’accorder sur les
exemples officiels de Biscuit). Une capacité dans un navigateur est lisible par tout script de la page : elle est
étroite (lire et acquitter les signaux d’un joueur) et finit d’elle-même, mais ce n’est pas un secret que la page peut
se cacher à elle-même.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) : Biscuit autorise un connecteur ; une signature
  atteste un événement (D15, D16 ; les mesures dans [`docs/dev/reality-spike.md`](../../docs/dev/reality-spike.md)).
- [ADR 0010](../../docs/dev/adr/0010-signal-v2.md) : un signal signé nomme le contexte pour lequel il a été signé.
- Les modèles de menace : [`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md),
  [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
- Le code : [`bridge/src/biscuit.ts`](../../bridge/src/biscuit.ts), [`bridge/src/policy.ts`](../../bridge/src/policy.ts),
  [`bridge/src/sign.ts`](../../bridge/src/sign.ts), [`src/engine/reality/protocol.ts`](../../src/engine/reality/protocol.ts).
