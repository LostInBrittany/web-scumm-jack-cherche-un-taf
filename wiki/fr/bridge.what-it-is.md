# Le Reality Bridge : ce que c’est

Un jeu quest'n'click peut réagir à un fait du monde extérieur : un e-mail qui répond, un webhook appelé, un badge
présenté, une commande tapée dans un terminal. Le jeu, lui, ne touche jamais au réseau. Un service à part, le
**Reality Bridge**, transforme le fait en un court **signal** signé, et le jeu l’applique comme une entrée du joueur :
une fois, sauvegardé, rejouable hors ligne. Cette page dit quelles sont les pièces et pourquoi elles sont découpées
ainsi. Pour l’essayer : [Démarrage rapide](bridge.quick-start.md) ; pour en faire tourner un :
[Installer et lancer le Bridge](bridge.install-run.md).

<a name="overview"></a>

## Ce que c’est

Trois mains portent un fait jusqu’au joueur, chacune vérifiant la précédente :

| Pièce | Tourne où | Fait | Détient |
|---|---|---|---|
| Un **connecteur** (e-mail, Telnet, SSH, Open Badges, ou le webhook de démonstration du Bridge) | son propre processus, à côté du Bridge | lit l’entrée extérieure comme hostile, la rattache à un joueur, propose un signal déclaré avec une clé de déduplication | son propre jeton Biscuit, ses propres secrets (un mot de passe de boîte mail, une clé d’hôte) |
| Le **Bridge** (`bridge/src/`, le paquet `@quest-n-click/bridge`) | un petit service Node | autorise le connecteur (Biscuit), vérifie le signal contre le manifeste du jeu, déduplique, le numérote par joueur, le signe (Ed25519), le garde jusqu’à l’accusé de réception du joueur | la clé qui signe les événements, les empreintes des capacités des joueurs, les signaux |
| Le **joueur** (le jeu dans le navigateur) | l’appareil du joueur | vérifie la signature avant de lire quoi que ce soit, applique le signal comme un événement, sauvegarde, puis accuse réception | une capacité qui lit et acquitte ses propres signaux, rien d’autre |

Un signal n’est qu’un identifiant pris dans une liste finie que le jeu déclare (`mail.answer.correct`) : aucun texte,
aucune adresse, aucune charge venue de l’extérieur n’atteint le jeu. Il arrive comme l’événement du jeu du même nom.
Le moteur l’applique au plus une fois, comme une entrée de la session, sauvegardée avant l’accusé de réception
(`src/engine/reality/protocol.ts` vérifie, `WorldSignalPort` est le transport, et un jeu sans `reality` ne charge rien
de ce code).

Le Bridge existe depuis la 4.1.1, les quatre connecteurs depuis la 4.1.9, plusieurs instances et plusieurs tenants sur
un même stockage depuis la 4.1.10. Son profil `local` (SQLite) est **stable** ; son profil `distributed` (Postgres,
plusieurs instances) et les connecteurs sont **expérimentaux** ([Stabilité et support](start.stability.md)).

<a name="why"></a>

## Pourquoi

- **Le jeu reste un jeu.** Un jeu est une page statique et une PWA : pas de socket, pas de secret, rien qui exécute ce
  qui vient de l’extérieur. Tout ce qui parle à des inconnus vit dans des processus que le jeu ne charge jamais ; le
  build du jeu ne contient rien de `connectors/` (vérifié par `tools/dist.ts`).
- **Une preuve qui n’a pas besoin du monde.** Comme un signal est un identifiant fini appliqué comme une entrée, le
  solveur peut prouver un jeu dans un monde qui ne répond jamais, dans les mondes que l’auteur scénarise, et dans un
  monde hostile, sans contacter aucun service ([Garanties](bridge.guarantees.md#proof)).
- **Une question, un mécanisme.** Biscuit répond à « qui peut proposer quoi » sur le Bridge ; une signature répond à
  « qu’est-ce que le Bridge a accepté » entre les mains du joueur. Un jeton volé à une étape n’ouvre pas la suivante
  ([Sécurité : Biscuit et signatures](bridge.security.md)).
- **Les vrais réseaux répètent et perdent.** La livraison se fait au moins une fois, appliquée une fois : chaque étape
  peut réessayer avec la même clé, et la sauvegarde se souvient de ce qui a été appliqué
  ([Garanties](bridge.guarantees.md#duplicates)).

<a name="alternatives"></a>

## Les options écartées

- **Le jeu qui appelle lui-même les services.** Écarté : cela mettrait des sockets, des secrets et du texte non fiable
  dans le joueur, et ferait dépendre une preuve du réseau.
- **COSE au lieu d’un JWS compact** pour le signal signé : il faudrait un décodeur CBOR dans le joueur, pour rien
  qu’un JWS n’offre déjà ici. Il reste la solution de repli si un navigateur pris en charge abandonne Ed25519 (D15,
  `docs/dev/reality-spike.md`).
- **Biscuit dans le joueur.** Le joueur ne voit jamais de Biscuit : il détient une capacité étroite, lire et acquitter
  (D16).
- **Une livraison « exactement une fois ».** Promise nulle part : la livraison est au moins une fois, appliquée de
  façon idempotente, un effet logique par clé (ADR 0008).
- **Des clés par tenant dérivées par construction**, qui rendraient implicite le tenant d’un signal. Écarté : le
  joueur ne peut pas vérifier une dérivation dont il ne détient pas la racine. Un signal nomme plutôt son contexte
  (ADR 0010).

<a name="trade-offs"></a>

## Les compromis

- Deux formats à maintenir (Biscuit et le JWS), une vérification croisée de Biscuit en Rust dans la CI
  (`npm run reality:xcheck`), des clés à faire tourner.
- Un auteur déclare chaque signal, et un signal `required` nomme une solution de repli que le joueur peut utiliser à
  la place : plus à écrire, et le jeu doit pouvoir se finir sans aucun extérieur.
- Un opérateur fait tourner un service de plus (et un processus par connecteur), avec son stockage, ses clés et ses
  sauvegardes.

> [!LIMIT id=bridge-not-a-game-server]
> Le Bridge porte des signaux déclarés de l’extérieur vers le jeu d’un joueur. Il n’exécute aucune logique de jeu, ne
> détient aucune sauvegarde, et ne partage pas l’état d’un jeu entre joueurs.

> [!LIMIT id=bridge-experimental-parts]
> Les connecteurs et le profil `distributed` sont expérimentaux : chaque test de contrat et d’abus tourne en CI, mais
> personne n’a encore fait tourner un connecteur contre un vrai fournisseur d’e-mail, un vrai badge ou un terminal
> exposé sur un réseau, ni le profil `distributed` derrière un vrai domaine pendant 24 à 48 heures.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) : Biscuit autorise un connecteur ; une signature
  atteste un événement.
- [ADR 0008](../../docs/dev/adr/0008-connector-sdk.md) : un connecteur est un processus à part, derrière un petit SDK.
- [ADR 0009](../../docs/dev/adr/0009-reality-store.md) : le Bridge garde son état derrière un stockage asynchrone.
- [ADR 0010](../../docs/dev/adr/0010-signal-v2.md) : un signal signé nomme le contexte pour lequel il a été signé.
- Les mesures du spike derrière D15 et D16 : [`docs/dev/reality-spike.md`](../../docs/dev/reality-spike.md) ; les
  modèles de menace : [`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md) et
  [`docs/dev/threat-models/`](../../docs/dev/threat-models/README.md).
