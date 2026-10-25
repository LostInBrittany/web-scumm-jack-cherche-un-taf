# Sécurité

Comment un Studio hébergé sur Clever Cloud décide qui fait une requête, ce qu’elle peut faire, en combien de temps un
membre retiré perd l’accès, et pourquoi le code du jeu ne touche jamais un secret. Chaque règle ici est lue dans le
code actuel ; ses limites sont dites.

<a name="why"></a>

## Pourquoi

Un Studio partagé porte le travail d’une équipe et fait tourner du code qu’un membre a écrit. Trois dangers le
façonnent : une page d’un autre site qui agit avec la session d’un membre (CSRF), un membre qui ne devrait plus entrer,
et le code du jeu qui atteindrait les secrets du Studio. Le fournisseur dit qui est quelqu’un ; le Studio décide de ce
qu’il peut faire (ADR 0027).

<a name="policies"></a>

## Les politiques HTTP

Chaque requête reçoit une seule politique, choisie par la requête seule ; jamais deux identités sur une requête.

| Politique | Quand | Règles |
|---|---|---|
| **A, cookie** | une requête d’API sans en-tête `Authorization` | Le cookie `__Host-ws_session` (`Secure`, `HttpOnly`, `SameSite=Lax`) ; seul son sha256 est stocké. Une mutation (POST, PUT, PATCH, DELETE) demande `Origin` égal à `publicUrl`, `X-Studio-Request: 1` et un corps JSON ; un refus dit seulement `forbidden` (403) |
| **B, Bearer** | un en-tête `Authorization` | Un jeton d’accès (un JWT) pour l’`audience` de la configuration, 5 min par défaut (15 au plus) ; les cookies sont ignorés. Un id_token, une autre audience, un jeton plus long, un non-membre, une `Origin` étrangère : refusés |
| **C, retour de connexion** | `GET /auth/callback` | La réponse du fournisseur à une connexion commencée côté serveur (Authorization Code, PKCE S256, state, nonce ; la pré-authentification à usage unique, 10 min) |
| **D, déconnexion back-channel** | `POST /auth/backchannel` | Un `logout_token` encodé en formulaire, vérifié selon la spécification ; un rejeu refusé par son `jti` |
| E, connexion et déconnexion | `GET /auth/login`, `POST /auth/logout` | Le chemin de retour d’une connexion est relatif seulement, jamais un autre site |
| F, l’origine du jeu | toute requête sur `playUrl` | Un ticket issu de la session de navigateur d’un membre ouvre une session de jeu (cookie `Secure; HttpOnly; SameSite=None; Partitioned`) ; sans lui, 401 « open the game from the Studio », avant que le chemin soit lu. Ni API, ni `/auth`, ni `/metrics` là |

Les rôles vivent dans le Studio : lire demande un reviewer, écrire un dev, les membres et le journal d’audit un owner.
Le dernier owner ne peut être ni rétrogradé ni retiré.

<a name="revocation"></a>

## La révocation, R = 15 minutes

| Événement | Quand l’accès prend fin |
|---|---|
| Un membre retiré ou révoqué dans le Studio | À sa requête suivante : sessions supprimées, chaque jeton émis avant refusé (`revoked_before`) ; ses connexions longues (flux en direct, MCP) se ferment sous 5 s, ses baux sont rendus |
| Une déconnexion back-channel du fournisseur | Tout de suite : avec un `sid`, cette session du fournisseur seulement ; avec un `sub` seul, chaque session et chaque jeton de l’utilisateur |
| Désactivé chez le fournisseur, sans back-channel | À la vérification suivante de la session : toutes les 5 min, par son jeton de rafraîchissement ; un refus définitif la termine |
| Le fournisseur injoignable | La session vit jusqu’à R (15 min) après sa dernière confirmation, puis elle est **suspendue** (503, échec fermé) jusqu’à ce qu’une vérification réussisse |
| Un fournisseur qui ne donne pas de jeton de rafraîchissement | Des sessions de R au plus |
| Un jeton de rafraîchissement qui ne s’ouvre plus (sa clé a quitté le trousseau) | La session se termine : reconnectez-vous ([Renouveler les clés](clever.key-rotation.md)) |

Les sessions du navigateur finissent aussi après 8 h d’inactivité ou 24 h en tout (`sessions.idleHours`,
`sessions.absoluteHours`).

> [!GUARANTEE id=provider-unreachable-suspends]
> Quand le fournisseur est injoignable plus longtemps que R, une session est suspendue : le Studio répond 503 plutôt
> que de la servir sans vérification, et la session revient dès que le fournisseur répond à une vérification. Le test
> tourne sur une horloge simulée, contre un fournisseur de test.

<a name="worker"></a>

## Le worker sans secret

Le code du jeu (son validateur, son solveur, ses prévisualisations, sa migration, les outils d’assets) ne tourne que
sur `studio-worker`, une seconde application (ADR 0028). Sur le runtime Node.js de Clever Cloud il n’y a qu’un
utilisateur système, et un processus enfant peut lire l’environnement de son parent par `/proc` (spike S §1) : le
worker ne détient donc **rien** qui vaille d’être volé.

- Il n’a ni identifiants de base ni identifiants Cellar (ne liez jamais les add-ons à lui) et aucune clé privée :
  seulement `WORKER_PUBLIC_KEY`, pour vérifier qu’un job a été signé par le Studio (Ed25519), pour son
  `WORKER_INSTANCE`, et pas expiré (un job vit au plus sa limite plus 30 s de décalage d’horloge).
- Un job lit son instantané et écrit son résultat par des URL S3 présignées, une clé et une durée chacune, dans un
  préfixe de dépôt à lui.
- Son enfant démarre avec un environnement vide (mesuré : 0 variable, spike S §6). Pour la mise à jour du moteur et la
  découpe des planches, le Studio refuse un résultat qui nomme un fichier qu’il n’a pas demandé.

> [!LIMIT id=worker-network]
> Le réseau sortant du worker n’est pas restreint : le code du jeu qui y tourne pourrait joindre Internet. Faire
> tourner le worker sans réseau sortant n’a pas été essayé (QUALIF-4.2.3 §7).

<a name="proxy"></a>

## Derrière les proxys de Clever : `trustProxy`

Le serveur ne croit `X-Forwarded-For` et `X-Forwarded-Proto` que venant des adresses de `trustProxy` ; avec OIDC et à
l’écoute au-delà de la boucle locale, il refuse de démarrer sans elles. C’est ainsi que deux membres derrière les
proxys de Clever sont distingués pour les limites de débit (les routes `/auth/` : 30 requêtes par minute et par
adresse, par instance, en mémoire ; ensuite 429). Les plages privées de l’exemple sont une hypothèse à réduire
([Configuration](clever.configuration.md#trust-proxy)).

<a name="secrets"></a>

## Les secrets

Lus une fois depuis `<NAME>_FILE` (0600) ou l’environnement, puis retirés de l’environnement du processus ; jamais
consignés. Les jetons de rafraîchissement et les id_tokens sont scellés en AES-256-GCM sous le trousseau
`STUDIO_SESSION_KEY`. Une sauvegarde est une entrée de confiance (elle peut ajouter des owners). La liste complète :
[Configuration](clever.configuration.md#secrets).

<a name="cookies"></a>

## Le cookie du jeu et les domaines

Avec `publicUrl` et `playUrl` sur deux sous-domaines d’un même domaine, le Studio et le jeu sont un seul site et le
cadre du jeu garde son cookie dans Chromium, Firefox et WebKit sous macOS, là où l’e2e hébergé le vérifie (pas WebKit
sous Linux ; un vrai Safari n’est pas encore vérifié). Deux noms en `*.cleverapps.io` sont deux sites, où le cookie
ne survit que partitionné (CHIPS), ce que WebKit sous Linux ne garde pas :
[Domaines et TLS](clever.domains-tls.md#why-one-domain).

<a name="alternatives"></a>

## Les autres possibilités écartées

- **Les droits chez le fournisseur (des groupes).** Le mainteneur a choisi le Studio le 17 octobre 2026 : le
  fournisseur ne détient aucun droit.
- **L’introspection des jetons** (RFC 7662) au lieu de jetons d’accès JWT courts : l’option documentée si un
  fournisseur ne peut pas émettre de jetons courts.
- **Faire tourner le code du jeu dans le processus du Studio** : il verrait les secrets du Studio.

<a name="trade-offs"></a>

## Les compromis

- Les limites de débit sont par instance et en mémoire : un redémarrage les remet à zéro.
- Un utilisateur désactivé garde l’accès jusqu’à 5 min sans déconnexion back-channel, jusqu’à R quand le fournisseur
  est en panne.
- La passe `studio-hosted` (un vrai Safari, les vraies plages des proxys de Clever) n’a pas été faite pour la 4.4.0.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0027, identité, sessions, jetons](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) ;
  [ADR 0028, où tourne le code du jeu](../../docs/dev/adr/0028-studio-content-execution.md) ;
  [le modèle de menaces](../../docs/dev/threat-models/studio-server.md).
- Le code : [`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts),
  [`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts),
  [`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts),
  [`studio-server/src/worker/job.ts`](../../studio-server/src/worker/job.ts).
- Le test derrière la garantie : [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
