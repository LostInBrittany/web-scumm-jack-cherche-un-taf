# web-scumm 4.2.1 → 4.2.3 « Studio Server » : un Studio hébergé en ligne, protégé par OIDC, pour travailler à plusieurs

> **Révision 4** (17 octobre 2026). Elle ajoute l'hébergement en ligne : OIDC (Keycloak), runtime Node.js natif de Clever
> Cloud, PostgreSQL, Cellar, un jeu par instance, BYOK. Le mainteneur l'a relue deux fois avec Codex (annexe C) et a
> validé le cap et le lancement du spike S.
> **Source normative** : ce fichier, dans Git. Toute copie hors du dépôt n'en est qu'un reflet.
> **Base** : `v4.2.0`, commit `a0ce19dc67e1b5844b43bdb5a79edb94ca771354`.
> **Nature** : une nouvelle surface produit. Le moteur, le DSL gelé (D28) et le Bridge ne changent pas de sens. La
> ligne 4.2.x ajoute, mais ne change ni nom public ni format (D40).


## 0. Contexte

**La demande.** Le mainteneur a demandé ceci le 17 octobre 2026 : « un plan pour aller jusqu'à la 4.2.3 qui permet
d'avoir un studio hébergé en ligne, protégé par un keycloak, potentiellement un OIDC, peu importe, mais une
authentification, et qui permette de travailler à plusieurs sur un truc ».

**Ce qui est déjà décidé** (révisions 1 à 3 de ce plan, PR #127) :
- **D39** : une seule copie du jeu, éditée en direct, avec des verrous explicites et des builds figés. Les CRDT sont
  reportés.
- Les principes **P1 à P8** (annexe A) :
  - P1 : la transaction est l'unité de modification ;
  - P2 : chaque fichier a un seul pan d'écriture ;
  - P3 : une garde de validation unique, appliquée sur l'état final ;
  - P4 : une prévisualisation par révision ;
  - P5 : tout porte une révision ;
  - P6 : durabilité et entrée unique ;
  - P7 : SSE plus une lecture HTTP par curseur ;
  - P8 : un seul processus écrivain.
- **D40** : la numérotation est 4.2.1 « Shared Floor », 4.2.2 et 4.2.3. La ligne 4.2.x peut ajouter des choses, mais
  jamais changer un nom public ni un format.

**Décisions du jour**, à inscrire en **D41** :
1. Formulation du mainteneur :
   > **L'hébergement de référence utilise une application Node.js native Clever Cloud, PostgreSQL, Cellar et Keycloak ou un fournisseur OIDC compatible. Docker n'est pas requis. Les traitements nécessitant des dépendances système sont qualifiés sur ce runtime ou exécutés dans un service séparé.**

   Docker Compose reste une commodité facultative pour les tests (services de CI, essais locaux). Il n'est jamais un
   prérequis, ni pour développer, ni pour déployer.
   Documentation du runtime : https://www.clever.cloud/developers/doc/deploy/applications/nodejs/
2. **Les droits vivent entièrement dans le Studio.** OIDC ne fournit que l'identité (`iss` + `sub`, email vérifié).
   Les rôles et l'appartenance au projet se gèrent dans le Studio.
3. **Un jeu par instance.** Une instance du serveur sert un seul projet.
4. **L'assistant IA fonctionne avec la clé de chacun** (BYOK), comme aujourd'hui. Aucun secret de fournisseur n'est
   stocké côté serveur.

**Ce que la révision 4 change** par rapport à la révision 3 (l'annexe A garde les principes, et le corps prévaut en cas
de divergence) :
- OIDC remplace les comptes locaux à mot de passe argon2id. Il n'y a plus aucun mot de passe dans le Studio.
- Les jetons de CLI et de MCP sont des **jetons d'accès OIDC** (device flow), et non plus des Biscuit.
- En hébergé, la vérité vit dans **Postgres** (journal) et **Cellar** (blobs). L'arbre `games/<id>/` de l'instance
  n'est qu'un **cache matérialisé**, parce que le disque d'une application Clever Cloud est éphémère (à confirmer par
  le spike S de 4.2.1). P1 garde sa garantie, mais son point de durabilité devient le commit Postgres après un PUT
  Cellar réussi, et non plus le fsync local.
- **Aucune image Docker** : on livre un paquet serveur versionné (archive + lockfile), des scripts de build et un guide
  de configuration Clever.
- **L'isolation du code de contenu** est à qualifier (§3.8). Le montage à deux utilisateurs système n'est pas supposé
  disponible, et les permissions Node ne protègent pas contre du code hostile.
- Tout ce qui exécute le jeu (aperçu, Play, Rooms, prévisualisations, builds) est servi sur une **origine de jeu
  distincte** du Studio dès 4.2.1 (§6.1).
- En 4.2.1, Play et Rooms sont un **aperçu vivant**, sur Vite en mode middleware, déclaré non figé. **P4 n'est livré
  qu'en 4.2.2**, avec les prévisualisations par révision, et Vite quitte alors le serveur de production (§6.2,
  §6.3).

**Condition de réussite**, inchangée : **aucune modification confirmée n'est perdue, et chacun sait exactement quelle
version il regarde.** S'y ajoute pour l'hébergé : **personne n'entre sans être authentifié, et personne ne fait plus
que son rôle**.

## 1. Constats vérifiés (`a0ce19d`, trois explorations du 17 oct.)

**Studio.**
- Le Studio est un plugin Vite lié à un seul jeu : `GAME`, `GAME_DIR` et `WEB_SCUMM_PROJECT` sont lus au démarrage
  (`tools/game.ts:15-56`). Vite écoute sur 127.0.0.1 (`vite.config.ts:152`).
- `security.ts` est conçu pour un usage local :
  - il compare `Origin` à `Host` brut (`:48-65`) et ne lit pas `X-Forwarded-*` ;
  - en LAN, un seul jeton partagé (`:67-82`) ;
  - le cookie n'a pas `Secure` et peut être posé depuis `?token=` (`:84`) ;
  - `decodeURIComponent` lève une exception sur un `%` malformé (`:14`).
- Les chemins `/__studio/api` sont codés en dur dans le client : `src/studio/api.ts:40`, `main.ts:81,358`,
  `assets.ts:263`, `assets-io.ts:18`, `assets-model.ts:82`, `assistant.ts:726,810`, et `core.ts:800`.
- Play (`?dev`) et Rooms (`?edit=`) dépendent du serveur de dev Vite (`src/main.ts:26`, `rooms-bridge.ts:55-75`),
  ainsi que la route `/__layout` (`tools/vite/plugins.ts:33`).
- Le jeu est importé dans le processus serveur à chaque chargement (`tsxImport`, `core.ts:88`). `importInChild`
  (`core.ts:97`) ne sert aujourd'hui qu'aux tests.
- Les vérifications tournent dans le processus, sans annulation ni timeout. `solve` est lancé sans `timeLimitMs`
  (`core.ts:681-695`), alors que la recherche sait gérer une échéance (`solve/search.ts:183`).
- Les assets exigent `python3` avec numpy, PIL et scipy (`cut-sheet.py:36-38`), ainsi que ffmpeg (`assets.py:174`).
  Les captures exigent Playwright et Chromium (`core.ts:765`). L'outil `run_tests` de l'assistant lance vitest
  (`backend.ts:84-93`).
- L'assistant reçoit la clé du navigateur dans `body.provider.apiKey` (`src/studio/assistant.ts:69,95`). Les hôtes de
  fournisseurs autorisés sont dans `assistant.ts:58,87-120`.
- Le MCP fonctionne **en stdio seulement** (`tools/mcp/server.ts:7,105`).
- Une dizaine d'écrivains de `games/` ont été recensés. Le détail est à l'annexe B.

**Briques réutilisables du Bridge.**
- Serveur `node:http` brut (`bridge/src/server.ts:170`) avec :
  - limite de corps (`:112-121`) ;
  - origines CORS en correspondance exacte ;
  - limitation de débit par seaux de jetons (`:77-102`) ;
  - trust-proxy par CIDR (`:61-73`) ;
  - `/livez`, `/readyz`, `/healthz` ;
  - arrêt propre (`cli.ts:395-421`).
- Logs en JSON, OpenTelemetry en option (`telemetry.ts`).
- Stores SQL (`store-sql.ts:25-39`) : SQLite avec `node:sqlite` en WAL, Postgres avec `pg` et des verrous
  consultatifs (`store-postgres.ts:46-80`).
- Migrations (`migrations.ts`). Le répertoire est codé en dur (`DIR`, `:7`) : il faut un paramètre additif.
- Baux de maintenance (`maintenance.ts`), sur l'horloge de la base, sans fencing par écriture.
- Backup schéma 4, avec un registre de complétude (`backup/tables.ts:7-19`).
- Secrets en fichiers 0600, valeurs non textuelles refusées au démarrage (`cli.ts:144-160`,
  `connectors/src/config.ts:7-18`).
- Fixture Postgres « une base par fichier de test » (`tests/fixtures/pg-database.ts`).

**Ce qui n'existe pas encore.**
- **Aucun code OIDC ni JWKS.** `jose` n'est présent qu'en dépendance transitive, via le SDK MCP, donc on ne peut pas
  s'en servir sans le déclarer.
- Le vérificateur JWS en WebCrypto de D15 (`src/engine/reality/protocol.ts:170-210`) n'accepte qu'EdDSA, avec un
  trousseau statique.

**Chaîne de release.**
- Les archives sont produites par `scripts/pack.mjs` avec esbuild, à partir de manifestes (`scripts/pack-manifests.mjs`)
  et de locks (`scripts/locks/`).
- L'image est produite par `scripts/bridge-image.mjs` (digests, SBOM). Le manifeste des artefacts est
  `tools/release/artifacts.mjs:20-70`.
- Jobs du candidat : `pack`, `image`, `external-consumer`, `deployment-smoke` et `candidate-gate`
  (`candidate.yml:376-750`).
- Qualification : `ops/qualify` (compose durci, Caddy) et `scripts/ops-qualify.mjs`.
- Mutation : `tools/mutation-sets.ts` (`MEASURED` puis `GATED`). Le `pg` est codé en dur dans
  `tools/mutation-shards.ts:108-114`.
- Couverture : seuls `src/**` et `bridge/src/**` sont inclus (`vite.config.ts:208`). Routage CI dans
  `tools/ci-plan.ts:99`.
- Passes : `PASS_IDS` (`tools/field/schema.ts:9-28`) et `docs/dev/surfaces.json`.
- **Le Bridge n'a pas d'image de production ni de déploiement Clever Cloud.** Seule l'image de qualification existe.

## 2. Architecture cible (fin de 4.2.3)

```
Navigateurs (devs, reviewers)          CLI / MCP distants (device flow → jeton d'accès OIDC)
        │ HTTPS (TLS terminé par le proxy Clever Cloud)
        ▼
┌──────── App Node.js native Clever Cloud « studio » (1 instance, min = max = 1) ────────┐
│ studio-server (paquet versionné, `npm ci` sur lockfile, commande de démarrage)          │
│  ├─ public_url : Studio buildé, /api, SSE /events, /auth/*                              │
│  ├─ play_url (autre origine) : aperçu, /preview/<rev>/, /play/<n>/, par ticket de jeu   │
│  ├─ Auth : RP OIDC (code + PKCE), sessions serveur, rôles Studio, CSRF                  │
│  ├─ File d'opérations unique (P1/P8) → journal Postgres + blobs Cellar                  │
│  ├─ Baux / pans / fencing (P2), présence, révisions (P5)                                │
│  └─ Cache de l'arbre `work/` matérialisé depuis le journal + blobs                      │
└──────────────────────────────┬──────────────────────────────────────────────────────────┘
                               │ jobs signés (HTTP interne, jeton de job à courte durée)
┌──────── App de traitement « studio-worker » (Node natif, ou autre runtime si le spike l'exige) ─┐
│ Aucun secret de la plateforme : ni base, ni clé de session, ni identifiants Cellar en écriture.  │
│ Reçoit un snapshot (URL présignée en lecture) et rend un résultat (URL présignée en écriture).   │
│ validate · lint · solve (échéance) · playtests · build preview · assets (Python, ffmpeg) · captures (Chromium) │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
        │                        │                         │
  PostgreSQL add-on        Cellar (S3, bucket privé)   Keycloak managé, ou tout OP OIDC
  journal, révisions,      blobs adressés par contenu, (identité seulement)
  sessions, membres,       builds, prévisualisations
  baux, audit
```

Le placement de chaque traitement (dans l'app studio ou dans l'app de traitement) est **décidé par la mesure** du spike
S (§7) et de la PR d'isolation (§3.8). Le schéma montre la cible si l'isolation par application séparée est retenue.

**Mode local**, inchangé pour l'auteur seul :
- `npm run dev` garde le plugin Vite ;
- le noyau d'opérations est le même, avec SQLite et des blobs `.studio/` sur disque ;
- il n'y a pas d'authentification (loopback, `security.ts`) ;
- les changements externes sont adoptés (P6).

**Mode serveur auto-hébergé hors Clever** : le même paquet, sur n'importe quel Node 22, derrière un proxy TLS. Un
compose **facultatif** (Postgres, MinIO, Keycloak) sert aux essais locaux. La CI utilise les conteneurs de service de
GitHub Actions, comme `bridge-postgres` aujourd'hui.

## 3. Authentification et autorisation

L'ADR 0027 est à réserver pour ce chapitre.

### 3.1 Le serveur comme Relying Party OIDC
- **Bibliothèque** : `openid-client` (panva), une RP certifiée OpenID, déclarée en dépendance avec une **version
  exacte**. La version précise est vérifiée sur npm au moment de la PR.
- **Configuration**, sur le modèle du Bridge (fichier + secrets en fichiers 0600) :
  - `issuer` ;
  - `client_id`, et `client_secret` dans un fichier ;
  - `public_url` ;
  - `scopes` (`openid email profile`).

  Le client est confidentiel.
- **Découverte** via `/.well-known/openid-configuration`. Les JWKS sont mis en cache et rechargés **une seule fois**
  quand un `kid` est inconnu (même motif que `client.ts:119-125`), avec un délai minimal entre deux rechargements.
- **Flux** : *Authorization Code* + **PKCE S256** + `state` + `nonce`.
  - Ces trois valeurs vivent dans un enregistrement de pré-authentification côté serveur, d'une durée de 10 min. Il est
    lié à un cookie `__Host-ws_pre` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`).
  - Au callback, la validation complète de l'id_token porte sur `iss`, `aud`, `azp`, `exp`, `iat` et `nonce`.
  - Algorithmes autorisés : RS256, ES256, PS256 et EdDSA. Jamais `none` ni HS*.
  - Le `redirect_uri` doit correspondre exactement.
- **Identité stockée** : la paire `(iss, sub)` est la clé d'identité. On conserve aussi `email`, `email_verified` et
  `name`. Un changement d'email côté fournisseur ne crée pas de nouvel utilisateur.
- **Déconnexion** :
  - RP-initiated (`end_session_endpoint`, `id_token_hint`, `post_logout_redirect_uri`) ;
  - **back-channel logout** : `POST /auth/backchannel` reçoit un logout_token signé et vérifié (`events`, `sid` ou
    `sub`, pas de `nonce`), puis tue les sessions concernées.

  Keycloak gère les deux.
- **Révocation** : les bornes, pour les sessions, les jetons Bearer et les connexions longues, sont au §3.6.

### 3.2 Sessions
- L'identifiant de session est opaque (256 bits). La base n'en stocke que le **hash SHA-256**.
- Cookie `__Host-ws_session` : `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - `Lax` et non `Strict` : le retour du fournisseur est une navigation intersite, et `Strict` ferait apparaître
    l'utilisateur déconnecté au premier chargement.
  - Le CSRF est donc fermé par §3.4.
- Expiration après **8 h** d'inactivité, et **24 h** au maximum. Ces deux valeurs sont paramétrables. Une rotation de
  l'identifiant a lieu à la connexion et à chaque élévation (par exemple en devenant owner).
- Une page « Mes sessions » permet de les révoquer. Un owner peut révoquer celles d'un membre.

### 3.3 Rôles et appartenance, entièrement dans le Studio (D41-2)
- Rôles par instance (un seul projet) :
  - `owner` : gère les membres, reprend les baux, lance le mode exclusif, les builds publics et les exports ;
  - `dev` : écrit sur les pans qu'il tient ;
  - `reviewer` : lit, joue et commente (commentaires en 4.2.3).
- **Amorçage** : `studio-server init` reçoit `--owner-email` (qui exige `email_verified = true`) ou
  `--owner-sub iss|sub`. Le premier login correspondant devient owner. **Personne n'est membre par défaut** : un
  utilisateur authentifié mais non membre voit une page « accès non accordé », sans aucune donnée.
- **Invitations** :
  - un owner invite par email, avec un rôle ;
  - le lien est à usage unique (7 jours), et seul son hash est stocké ;
  - il est consommé au premier login dont l'email **vérifié** correspond ;
  - le membre est ensuite lié à `(iss, sub)`.
- **Matrice de permissions** : un tableau rôle × route, écrit dans le code et testé. Toute route non listée est
  refusée par défaut, et un test parcourt toutes les routes enregistrées.
- **Dernier owner** : on ne peut pas retirer ou rétrograder le dernier owner.

### 3.4 Protection des requêtes : quatre politiques explicites

Chaque route déclare sa politique. Une route sans politique est refusée au démarrage du serveur (test sur la table des
routes). Une requête qui ne correspond pas à la politique de sa route est refusée. Les exceptions ci-dessous sont les
seules.

**Choix entre A et B sur une route d'API** : il est déterministe et ne dépend que de la requête.
- **Un en-tête `Authorization` est présent** : la politique B s'applique. Les cookies sont ignorés, et la requête
  n'agit qu'avec l'identité du jeton.
- **Aucun en-tête `Authorization`** : la politique A s'applique.

Il n'existe donc jamais deux identités sur une même requête. Un site tiers ne peut pas exploiter B, puisqu'il ne peut
ajouter un en-tête `Authorization` qu'après un préflight CORS, que le serveur refuse.

| Politique | Routes | Authentifiée par | Exigences | Refus |
|---|---|---|---|---|
| **A · navigateur, par cookie** | Toutes les API du Studio appelées par la page (`/api/*`, `/events`) | Cookie `__Host-ws_session` | Mutation (POST, PUT, PATCH, DELETE) : `Origin` **présent et égal** à `public_url` (pas de repli sur `Referer`) ; `Content-Type: application/json`, ou `multipart/form-data` sur les seules routes d'upload ; en-tête `X-Studio-Request: 1`. | 403 sans détail ; le compteur d'échecs alimente la limite de débit |
| **B · client API, par Bearer** | Les mêmes API, appelées par le CLI et le MCP | `Authorization: Bearer <jeton d'accès>` (§3.5) | Les cookies sont **ignorés** sur ces requêtes, donc pas de CSRF possible. `Origin` n'est pas exigé. S'il est présent, il doit être égal à `public_url`, sinon c'est un navigateur tiers et la requête est refusée. Pas de CORS ouvert. `Content-Type: application/json` sur les mutations. | 401 avec `WWW-Authenticate: Bearer error=…` (RFC 6750) |
| **C · retour OIDC** | `GET /auth/callback` | Cookie de pré-authentification `__Host-ws_pre` + `state`, PKCE et `nonce` (§3.1) | GET seulement, navigation de premier niveau, pas de contrôle d'`Origin`. Pré-authentification à usage unique, détruite au premier passage. `redirect_uri` exact. Redirection finale uniquement vers un chemin relatif mémorisé dans la pré-authentification. | 400 et page d'erreur sans le détail du fournisseur |
| **E · connexion et déconnexion** | `GET /auth/login` (démarrage) ; `POST /auth/logout` | Démarrage : aucune authentification, crée la pré-authentification (§3.1). Déconnexion : politique A | `login` : GET seulement, paramètre `returnTo` accepté **uniquement comme chemin relatif** (sinon `/`), limite de débit par IP. `logout` : exigences de A, détruit la session Studio **et** les sessions de jeu qui en dépendent (§6.1), puis redirige vers l'`end_session_endpoint` du fournisseur avec `id_token_hint` et `post_logout_redirect_uri` exact. | 400 ou 403 |
| **F · tickets de jeu** | `POST /api/play-ticket` (sur `public_url`) ; `GET /_ticket` (sur `play_url`) | Émission : politique A (membre) ; échange : le ticket seul | Émission : ticket signé, à usage unique, ≤ 60 s, lié à l'utilisateur, à la session Studio, à l'instance et à la ressource visée. Échange : consommé une seule fois, crée une **session de jeu** côté serveur (§6.1), redirige vers un chemin relatif sur `play_url`. `Referrer-Policy: no-referrer`, ticket masqué dans les logs. | 403 ; ticket rejoué ou expiré : 410 |
| **D · back-channel logout** | `POST /auth/backchannel` | Le seul `logout_token` (spécification OpenID Connect Back-Channel Logout 1.0, §2.4–2.6) | `Content-Type: application/x-www-form-urlencoded`, paramètre `logout_token`. Pas de cookie, pas d'`Origin`, pas d'en-tête CSRF. Validation : signature par JWKS, `iss`, `aud` = `client_id`, `iat` récent (≤ 5 min), `jti` jamais vu (cache de rejeu jusqu'à l'expiration), claim `events` avec l'URI back-channel, `sid` ou `sub` présent, **`nonce` absent**. Réponse `200` ou `400`, `Cache-Control: no-store`. | 400 ; limite de débit par IP |

Hors politique, deux familles sont publiques et en lecture seule :
- `GET /livez`, `/startz` et `/readyz` (§4) ;
- les fichiers statiques de la page de connexion.

Mesures communes :
- **Trust-proxy** par CIDR (motif `bridge/src/server.ts:61-73`) pour l'IP cliente et `X-Forwarded-Proto`. `Host` ne
  sert jamais de référence d'origine.
- **En-têtes** sur l'origine du Studio :
  - CSP stricte : `default-src 'self'` ; `connect-src` limité à `'self'` et aux hôtes de fournisseurs LLM autorisés ;
    `frame-src` limité à l'origine de jeu (§6) ; `frame-ancestors 'self'` ;
  - `X-Content-Type-Options` ;
  - `Referrer-Policy: same-origin` ;
  - HSTS, si le proxy ne le pose pas.
- **Limites de débit** :
  - par IP pour `/auth/*` et pour les échecs d'authentification ;
  - par utilisateur pour les opérations et les jobs lourds.
- **Tailles** : 1 MiB de JSON, 32 MiB par upload, quota de stockage par instance.
- **Logs** : jamais de jeton, de cookie, d'URL présignée ni de clé. Le `?token=` du mode LAN n'existe pas en mode
  serveur.
- **Tests** : pour chaque politique, une matrice de cas acceptés et refusés. Un back-channel logout conforme passe
  malgré l'absence d'`Origin`. Une mutation par cookie sans `Origin` échoue. Un appel Bearer sans `Origin` passe. Un
  appel avec Bearer **et** cookie suit B, et le cookie n'a aucun effet : un Bearer invalide donne 401 même si le cookie
  est valide. `returnTo` absolu est ramené à `/`. Un ticket ne s'échange qu'une fois.

### 3.5 Jetons pour CLI et MCP
- `web-scumm studio login --server https://…` utilise l'**OAuth 2.0 Device Authorization Grant**, avec un client
  public `web-scumm-cli` côté Keycloak. Les jetons sont stockés dans le trousseau de l'OS, ou à défaut dans un fichier
  0600.
- Le serveur accepte le jeton d'accès comme **Bearer JWT** (politique B), sous ces conditions :
  - signature vérifiée par JWKS ;
  - `iss` ;
  - **`aud` contenant l'audience du Studio** (mapper d'audience Keycloak documenté) ;
  - `exp` et `iat` ;
  - **durée de vie ≤ 5 min** (`exp − iat`, paramétrable jusqu'à 15 min au plus) ;
  - l'utilisateur est **membre** au moment de la requête ;
  - `iat` est postérieur à sa date de révocation Studio (§3.6).

  Un id_token présenté comme Bearer est refusé (`typ`, `aud`, absence de `azp` attendu).
- Le CLI renouvelle son jeton d'accès avec le refresh token auprès du fournisseur. Si le compte est désactivé, ce
  renouvellement échoue, et l'accès cesse au plus tard à l'expiration du jeton d'accès en cours.
- 4.2.1 : le MCP local en stdio devient un **client** de l'API distante avec ce jeton.
- 4.2.3 : un **MCP distant** en Streamable HTTP, qui s'annonce comme ressource protégée (Protected Resource Metadata,
  RFC 9728) selon la spécification d'autorisation MCP. Le fournisseur reste l'autorité, avec les mêmes contrôles
  (politique B).

### 3.6 Révocation : bornes vérifiables

**Bornes, avec R = 15 min :**
- Un membre retiré, rétrogradé, ou dont les sessions sont révoquées **dans le Studio** perd l'accès à **la requête
  suivante**. Ses connexions longues sont fermées **dans les 5 s**.
- Un back-channel logout reçu ferme les sessions visées **immédiatement**, et leurs connexions longues **dans les 5 s**.
- Un compte désactivé ou une session fermée **chez le fournisseur**, sans back-channel logout, perd l'accès **en R au
  plus**, que le fournisseur réponde ou non.

**Mécanismes :**

- **Session navigateur.**
  - Le refresh token est gardé **chiffré** (AES-256-GCM, clé fournie comme secret, rotation par trousseau de clés).
  - Il est vérifié auprès du fournisseur **toutes les 5 min** pendant l'activité.
  - **Refus définitif** : `invalid_grant`, ou 400/401 de l'endpoint de jeton. La session est **terminée sur-le-champ**.
  - **Panne transitoire** : réseau, délai dépassé ou 5xx. La session continue tant que le dernier succès date de
    moins de R.
  - Au-delà de R, la session est **suspendue** (*fail closed*) : l'interface dit « fournisseur d'identité
    injoignable ». La session reprend dès qu'une vérification réussit, sauf refus définitif.
- **Jetons Bearer** : durée de vie ≤ 5 min (§3.5), donc ≤ R sans introspection. On ajoute deux contrôles côté Studio,
  à chaque requête :
  - l'appartenance au projet ;
  - une **date de révocation par utilisateur** (`revoked_before`), posée par un retrait de membre, une révocation par
    un owner ou un back-channel logout ciblant `sub`. Tout jeton dont l'`iat` est antérieur est refusé.

  L'introspection (RFC 7662) reste une option documentée, désactivée par défaut, pour les fournisseurs qui imposent
  des jetons longs.
- **Connexions longues (SSE, flux MCP).**
  - Chaque connexion est rattachée à sa session ou à son jeton.
  - Un événement de révocation (retrait, back-channel, suspension) les ferme par un bus interne, dans les 5 s.
  - De plus, chaque flux est fermé à l'échéance du jeton qui l'a ouvert, et le client se reconnecte avec un jeton
    neuf.
  - Un contrôle périodique (30 s) rattrape un événement manqué.
- **Tests** (horloge et fournisseur simulés) :
  - désactivation chez le fournisseur sans back-channel, avec fermeture à R ;
  - panne du fournisseur : suspension à R, puis reprise ;
  - refus définitif : fermeture immédiate ;
  - jeton Bearer de 10 min : refusé ;
  - jeton émis avant `revoked_before` : refusé ;
  - flux SSE et MCP fermés dans les 5 s après chaque type de révocation.

### 3.7 Journal d'audit
Une table `audit` en ajout seul enregistre :
- les connexions et déconnexions ;
- les échecs d'authentification ;
- les changements de membres et de rôles ;
- les invitations ;
- les reprises de bail ;
- le mode exclusif ;
- les exports ;
- les builds publics ;
- les restaurations.

Les opérations de contenu sont déjà dans le journal (P1). L'audit est consultable par les owners et exportable.

### 3.8 Isolation de l'exécution côté serveur (à qualifier, pas à supposer)

Valider ou compiler exécute le TypeScript du jeu (§1). Sur le runtime Node natif, on ne suppose ni plusieurs
utilisateurs système ni conteneur dédié. **Le modèle de permissions de Node limite les accidents. Ce n'est pas une
frontière contre du code hostile.**

**Ce qu'un verdict exécuté ailleurs prouve, et ce qu'il ne prouve pas.**
- Un résultat produit par du code non fiable **ne peut pas être prouvé honnête** par un schéma, un hash et une taille.
  Un résultat falsifié peut respecter les trois.
- Les verdicts (validate, lint, solve, playtests) sont donc des **signaux de qualité dans le domaine de confiance du
  projet**, jamais des décisions de sécurité.
  - Un membre `dev` qui voudrait les falsifier peut déjà écrire du contenu cassé : il est de confiance pour le contenu
    (D41-2, rôles).
  - La garde 422 (P3) protège contre l'erreur, pas contre la malveillance d'un membre.
- **Recompilation fraîche** (4.2.2) : un build peut être recompilé sur une instance de traitement fraîchement
  déployée, puis son manifeste comparé octet pour octet.
  - Ce contrôle vérifie la **reproductibilité**, et aide à détecter la **contamination** d'une instance par un job
    antérieur.
  - Il **ne prouve pas l'innocuité** du contenu, exécuté de la même façon dans les deux builds.
  - Son coût (redéploiement, durée) est **mesuré en 4.2.2** avant de décider s'il devient obligatoire pour une
    publication, ou une option de l'owner.

**Séparation dans l'application de traitement (`studio-worker`), si l'ADR 0028 la retient.**
- **Superviseur de confiance** :
  - il reçoit le job ;
  - il vérifie la signature du Studio (**clé publique seulement** côté worker : il ne détient aucun secret de
    signature) ;
  - il télécharge le snapshot ;
  - il lance **un processus enfant neuf par job**, dans un répertoire de travail neuf, avec un environnement vidé ;
  - il lit la sortie du job, la borne, la téléverse lui-même ;
  - il nettoie.

  **Le superviseur et le code exécuté partagent la même machine et le même utilisateur système.** Les permissions de
  Node ne sont pas une frontière. On **ne garantit donc pas** que le code exécuté ne voie pas les capacités
  temporaires du job : URL présignées et jeton de job. On les considère **visibles par le code du job**, et, par
  persistance, par le code des jobs suivants de la même instance jusqu'à son recyclage.

  Une séparation effective entre superviseur et exécution n'est **pas qualifiée**. Si le spike S en trouve une sur un
  runtime natif, l'ADR 0028 pourra relever ce niveau.
- **Signature d'un job.** Elle couvre ensemble :
  - `job_id` (aléatoire, à usage unique) ;
  - l'identifiant d'instance ;
  - l'époque et la révision ;
  - le hash du manifeste de snapshot ;
  - le type de job et ses paramètres ;
  - la destination : un préfixe de staging propre au job, `staging/<job_id>/` ;
  - l'expiration (≤ 5 min).

  Le worker refuse un job expiré, déjà vu (cache de `job_id` jusqu'à l'expiration), ou dont le snapshot ne correspond
  pas au hash signé.
- **Droits temporaires.** Ce sont des URL Cellar présignées, à qualifier par le spike S : réutilisation possible
  jusqu'à l'expiration, et écrasement possible d'un objet existant par un PUT, comme sur S3.
  - **Lecture** : un objet de snapshot, expiration ≤ 5 min. Le worker **voit les données privées du projet du job** :
    c'est voulu, et le modèle de menaces l'écrit.
  - **Écriture** : uniquement des clés sous `staging/<job_id>/`, jamais une clé publiée. Un écrasement dans ce préfixe
    ne touche que ce job.
  - **Ce que permet une capacité volée** : pendant ≤ 5 min, lire le snapshot du job (données du même projet) et écrire
    dans le staging de ce job. Rien d'autre : ni objet publié, ni autre préfixe, ni autre instance.
  - Le **Studio** accepte la sortie : bornes, schéma, cohérence avec le job. Il recalcule lui-même le hash, copie dans
    `sha256/<hex>`, puis supprime le staging. Le worker ne choisit donc jamais une clé publiée, et ne peut pas modifier
    un objet déjà accepté (adressage par contenu).
- **Nettoyage entre jobs, et effet sur les jobs suivants.**
  - Après chaque job : le groupe de processus est tué, le répertoire de travail supprimé, et aucun processus enfant
    ne survit. C'est vérifié par la liste des processus avant le job suivant.
  - Sans séparation d'utilisateurs système, un code hostile **pourrait persister** sur l'instance (fichiers du
    superviseur, cache) et **fausser les jobs suivants de la même instance**. Il n'obtient aucun secret de plateforme,
    et ne peut pas écrire hors des préfixes de staging de ces jobs. Il peut seulement fausser leurs verdicts et leurs
    sorties.
  - Réponses :
    - une instance n'exécute que les jobs **d'une seule instance Studio**, donc d'un seul projet et d'un seul domaine
      de confiance ;
    - l'instance de traitement est **redéployée** périodiquement (paramètre), et à la demande avant une recompilation
      fraîche ;
    - le risque résiduel est écrit dans l'ADR 0028.
- **Le choix de la frontière** (application séparée, ou enfant local en mode local seulement) est décidé dans
  l'**ADR 0028**, sur la base des mesures du spike S et de la PR I. Ce choix inclut la garde synchrone (§11,
  performance).
- **Tests**, uniquement sur ce qui est réellement garanti :
  - un job hostile n'obtient **aucun secret de plateforme** (base, sessions, clés de signature, identifiants Cellar
    permanents), puisque l'application n'en a pas ;
  - **portée des capacités** : une URL présignée de lecture ne lit que son objet ; une URL d'écriture n'écrit que dans
    `staging/<job_id>/` ; les deux expirent. C'est vérifié contre Cellar (MinIO en CI) ;
  - **acceptation par le Studio** : il ne publie jamais une clé choisie par le worker, et un objet déjà publié ne
    change jamais (adressage par contenu) ;
  - un jeton de job rejoué, expiré ou au snapshot falsifié est refusé ;
  - un processus survivant détecté marque l'instance à recycler ;
  - une recompilation fraîche dont le manifeste diffère est signalée.

  Il n'y a **pas** de test « le job ne voit pas l'URL présignée » : ce n'est pas garanti.

### 3.9 Modèle de menaces
`docs/dev/threat-models/studio-server.md`, au format existant : actifs, adversaires, tableau « menace / réponse /
test », risques résiduels. Il est écrit en 4.2.1, avant tout déploiement public. Menaces couvertes :
- vol de session ;
- CSRF ;
- open redirect au retour du fournisseur ;
- confusion de jeton (id_token utilisé comme jeton d'accès, mauvaise audience) ;
- substitution de JWKS ;
- membre malveillant ;
- traversal de chemins dans les uploads et les imports ;
- déni de service par builds et solveur ;
- clé LLM côté navigateur (BYOK, jamais journalisée ni persistée par le serveur) ;
- fuite par les logs ;
- reprise de bail abusive ;
- **jeu hostile dans le navigateur** d'un autre membre : origine de jeu séparée, tickets, `postMessage` limité
  (§6.1) ;
- **worker de traitement** :
  - données de projet visibles ;
  - URL présignées réutilisables jusqu'à leur expiration ;
  - écrasement dans le staging ;
  - persistance entre jobs ;
  - verdicts falsifiables (§3.8) ;
- **instance zombie** après redéploiement : fencing dans chaque transaction (§4).

## 4. Données et durabilité en hébergé

Adaptation de P1, P5 et P8.

**Stockage.**
- **Blobs** : une interface `BlobStore`, avec une implémentation `fs` en local et une implémentation `s3` (Cellar, et
  MinIO en CI). La clé est `sha256/<hex>`, immuable, et seul le Studio y écrit. La lecture est vérifiée par hash.
- **Journal et révisions** dans Postgres (SQLite en local) :
  - `ops` : id client, auteur, révision, effets, état, **réponse enregistrée** ;
  - `file_revs` : chemin → blob, par révision ;
  - `revisions` : époque et compteur.
- **Secrets sur le runtime natif.** Clever injecte la configuration par variables d'environnement, alors que la règle
  de la maison dit « secrets en fichiers » (`ops/qualify/README.md:29-30`).
  - Le chargeur accepte `*_FILE` (fichier 0600, préféré hors Clever) ou la variable.
  - Au démarrage, les variables secrètes sont lues puis **retirées de `process.env`**. Elles ne sont jamais
    journalisées. Les valeurs non textuelles ou trop courtes sont refusées.
  - Cette dérogation est écrite dans l'ADR 0027.

**Une opération, du début à la réponse.**
1. Les blobs « après » sont écrits par PUT dans Cellar. Un échec arrête tout : rien n'est confirmé, et les blobs
   orphelins sont ramassés par un GC.
2. **Transaction Postgres**, qui est le **point de linéarisation et de confirmation** :
   - vérification du jeton de fencing du bail de service et de ceux des pans ;
   - vérification des révisions par fichier ;
   - écriture de l'op, des `file_revs` et de la **réponse** ;
   - incrément de la révision.
3. **Réponse au client : succès**, dès que le commit est acquis. La suite n'en dépend pas.
4. **Après le commit, en tâche de fond** : mise à jour du cache de travail (§6, aperçu vivant) et émission des
   événements.

**Ce qui est garanti, et testé :**
- **Retry après commit.** Un même id d'opération renvoie la **réponse enregistrée**, sans réappliquer. C'est vrai
  même si le client n'a jamais reçu la première réponse, et même si la matérialisation a échoué.
- **Issue du commit inconnue** (connexion perdue pendant `COMMIT`). Le serveur relit l'état de l'op avant de répondre.
  S'il ne peut pas conclure, il répond `503` avec l'id. Le retry du client tranche (`confirmed` ou absente, puis
  réappliquée une seule fois).
- **Aucune lecture ne mélange deux révisions.**
  - L'API de lecture ne lit **jamais** le cache de travail. Elle résout `chemin → blob` dans `file_revs` **à une
    révision donnée** (la tête au début de la requête, renvoyée dans la réponse) et lit les blobs (cache local
    vérifié par hash, sinon Cellar).
  - Les exécutions (validate, builds, jobs) travaillent sur un **snapshot immuable par révision**, matérialisé dans un
    répertoire neuf par liens physiques depuis le cache de blobs, jamais sur le cache de travail.
  - Le cache de travail ne sert qu'à l'**aperçu vivant** de 4.2.1, déclaré non cohérent (§6).
- **Réparation sans redémarrage.** Un réconciliateur compare le cache de travail à `file_revs` en tête :
  - après chaque op ;
  - toutes les 30 s ;
  - et sur demande d'un owner.

  Il corrige les écarts. Un échec répété est visible dans la santé de l'instance, et ne bloque ni les écritures ni
  les lectures.
- **Événements manqués.** Les événements sont émis **après** le commit, au moins une fois. Le client les dédoublonne
  par révision et retrouve un trou par `GET /ops?epoch&after=` : le journal est la source, pas le flux.

**Instance unique et redéploiement (P8)**, sans dépendre d'un arrêt propre.
- **Trois sondes** :
  - `/livez` : le processus répond ;
  - `/startz` : démarrage réussi (configuration chargée, base joignable, migrations à jour). C'est **la sonde de
    santé de la plateforme**, à confirmer par le spike S ;
  - `/readyz` : **prêt à écrire**, c'est-à-dire bail de service détenu et cache de blobs prêt. Sinon 503.

  La disponibilité réelle n'est jamais masquée : l'interface et la supervision lisent `/readyz`.
- **Bail de service** dans Postgres :
  - TTL = 30 s, renouvelé toutes les 10 s, sur l'horloge de la base ;
  - **jeton de fencing** incrémenté à chaque prise.
- **Chaque transaction d'écriture vérifie deux conditions distinctes**, sous verrou de ligne sur le bail, dans la même
  transaction :
  1. **le bail n'est pas expiré** : `expires_at > clock_timestamp()`, à l'heure de la base ;
  2. **le propriétaire est toujours lui** : le fencing courant est égal au sien.

  La condition 1 refuse une instance dont le bail a expiré même si aucune nouvelle instance n'a encore pris le bail.
  La condition 2 refuse une instance remplacée par un propriétaire au fencing supérieur.
- **Transactions finales courtes**, sans attente extérieure :
  - aucune E/S réseau (Cellar, fournisseur, worker) **pendant** une transaction : les blobs sont écrits **avant**, la
    diffusion a lieu **après** ;
  - délais imposés côté base, **sur chaque connexion** :
    - `lock_timeout` = 2 s ;
    - `statement_timeout` = 5 s ;
    - `idle_in_transaction_session_timeout` = 5 s ;
    - keepalives TCP actifs.

  Une instance figée **après avoir pris le verrou de ligne et avant `COMMIT`** voit sa session terminée par Postgres
  au plus tard après 5 s d'inactivité dans la transaction, ce qui libère le verrou. Son `COMMIT` tardif échoue,
  puisque la connexion est fermée.
- **L'ancienne instance** cesse d'elle-même d'accepter des écritures (`holdWrites`, échéance locale monotone = TTL −
  marge) dès qu'elle n'arrive plus à renouveler.
- **La nouvelle instance** tente la prise avec `lock_timeout`, et réessaie jusqu'à expiration du bail.
  - **Borne de reprise** : ≤ TTL (30 s) + `idle_in_transaction_session_timeout` (5 s) + `lock_timeout` (2 s) +
    intervalle de nouvelle tentative (1 s), soit **≤ 38 s**.
  - Ce sont des valeurs initiales, remesurées par le spike S sur l'add-on Postgres de Clever, notamment pour savoir si
    ces paramètres de session sont autorisés. La borne publiée sera la borne mesurée.
- **SIGTERM** n'est qu'un **raccourci** : l'ancienne libère son bail tout de suite. Il n'est pas une condition de
  réussite.
- **Pendant la bascule**, les écritures reçoivent `503 Retry-After`. Les clients rejouent avec le même id d'opération
  (P6), sans perte ni doublon.
- La configuration Clever de l'application studio impose `min = max = 1` instance. L'application de traitement peut
  avoir plusieurs instances : elle n'a pas d'état.
- **Scénarios testés** :
  - ancienne instance vivante mais coupée de la base (renouvellement bloqué) ;
  - ancienne instance figée (SIGSTOP), qui ne libère jamais ;
  - **ancienne instance figée après acquisition du verrou de ligne et avant `COMMIT`** : la nouvelle prend le bail dans
    la borne, et le `COMMIT` repris de l'ancienne échoue ;
  - bail expiré sans nouveau propriétaire : écriture de l'ancienne refusée par la condition 1 ;
  - écriture tardive de l'ancienne instance, commise après la prise par la nouvelle : refusée ;
  - aucun SIGTERM ;
  - SIGTERM normal.

**Sauvegarde, restauration, récupération.**
- 4.2.1 : `studio-server export` produit une archive du jeu à une révision donnée (tar + manifeste de hashes).
- 4.2.2 : `backup` et `restore` pour la base (registre de complétude, motif `bridge/src/backup/tables.ts`) et la liste
  des blobs, avec des modes explicites (motif D36).
  - **Une restauration retrouve la révision sauvegardée**, pas davantage.
  - Pour aller plus loin, une **expédition continue du journal** : chaque op confirmée est copiée, de façon
    asynchrone, dans des segments immuables sur Cellar (op + références de blobs). Une restauration rejoue ensuite
    les segments postérieurs à la sauvegarde, jusqu'à la dernière op expédiée.
  - Le **retard d'expédition** (RPO) est mesuré, publié dans la santé de l'instance, et documenté. Cible : ≤ 1 min.
    La perte possible en cas de destruction de la base est donc **bornée et affichée**, jamais présentée comme nulle.
  - Un exercice de restauration fait partie de la qualification.
- Côté Clever : les sauvegardes de l'add-on PostgreSQL et un bucket Cellar dédié. Ce sont des compléments, à
  qualifier ; le Studio n'en dépend pas pour ses garanties.

**Import initial.** Le projet de l'instance est importé une fois, par `studio-server import <tar|dossier|url git>`, en
mode exclusif. La montée de version du moteur (`web-scumm migrate`) est une opération exclusive (4.2.3).

## 5. Collaboration en direct

Ce chapitre reprend le plan de la PR #127 : P2, P5, P6 et P7.
- **Pans** :
  - la carte est générée et testée, avec un fichier par pan (table du P2) ;
  - une opération qui touche plusieurs pans les prend tous ou aucun, sans attendre ;
  - mode exclusif pour `ids`, les migrations et la préparation des assets ;
  - TTL de 120 s, battement de 30 s ;
  - les baux sont pris, renouvelés et repris par la file, avec fencing.
- **Révisions** :
  - un 409 se juge **fichier par fichier** ;
  - une époque par projet ;
  - « révision N » est toujours affichée ;
  - un diagnostic plus ancien que la révision courante est marqué *périmé*.
- **Diffusion** :
  - un flux SSE `/events` (révisions, baux, présence, santé, builds) ;
  - `GET /ops?epoch&after=` pour la reprise ;
  - la présence passe par le battement HTTP.
- **Undo** : désactivé en mode serveur en 4.2.1. En 4.2.2, il devient personnel et émet l'opération inverse.
- **Brouillons** : un 423 ou un 409 conserve le brouillon côté client, que l'on peut copier ou réessayer.

## 6. Ce que l'on joue, et depuis quelle origine

### 6.1 Isolation dans le navigateur (dès 4.2.1)

Le JavaScript du jeu est du **code non fiable vis-à-vis de la session Studio**. N'importe quel fichier de contenu est un
module exécuté, et un membre `dev` peut y écrire du code. Servi sur l'origine du Studio, il pourrait :
- appeler l'API avec la session de celui qui regarde, owner compris (membres, exports) ;
- lire le stockage de cette origine, dont la clé BYOK en `sessionStorage`.

Un chemin `/preview/` sur la même origine ne change rien. Exclure le « code personnalisé » n'est pas applicable non
plus : tout contenu est du code. D'où :

- **Deux origines.** Le Studio est servi sur `public_url` (ex. `https://studio.exemple.fr`). Tout ce qui exécute le jeu
  (aperçu, Play, Rooms, prévisualisations, builds) est servi sur une **origine de jeu distincte**, `play_url` (ex.
  `https://play.exemple.fr`).
  - Les deux domaines sont attachés à la même application Clever, et le routage se fait par `Host` (à confirmer par le
    spike S).
  - **Même site ou deux sites : à trancher par le spike S.** Dans une iframe intersite, le cookie de jeu devient un
    cookie tiers, que Safari bloque par défaut. Deux options sont mesurées.
    - **Option recommandée a priori : deux origines sur le même site** (`studio.exemple.fr` et `play.exemple.fr`).
      Le cookie de jeu reste *first-party* dans l'iframe. La protection repose sur les politiques A et F : `Origin`
      exact, JSON, en-tête personnalisé, donc un préflight CORS que le Studio refuse. Les cookies `Lax` du Studio
      partent bien vers les requêtes *same-site*, mais aucune mutation ne passe sans `Origin` = `public_url`. C'est
      testé.
    - **Option intersite** : seulement avec un mécanisme qui n'exige pas de cookie tiers, par exemple une capacité
      dans le chemin (`/c/<capacité>/…`) à courte durée, avec `Referrer-Policy: no-referrer` et un masquage dans les
      logs. On la retient seulement si le spike la montre fiable sur Safari, Firefox et Chromium.
  - **Critère du spike** : Play et Rooms fonctionnent dans Safari et WebKit **avec le blocage des cookies tiers actif
    par défaut, sans changer les préférences**, ainsi que dans Firefox et Chromium.
- **Accès à l'origine de jeu.**
  - Le cookie de session Studio est `__Host-` : il n'est jamais envoyé à `play_url`.
  - L'origine de jeu a sa propre **session de jeu**, créée par l'échange d'un **ticket de jeu** (politique F) et
    portée par le cookie `__Host-ws_play` (`Secure`, `HttpOnly`, `SameSite=Strict`), ou par la capacité dans le
    chemin si le spike retient l'option intersite.
  - **Durée** : 15 min glissantes au plus, sans jamais dépasser la session Studio dont elle dépend.
  - **Révocation** : la session de jeu est **liée à la session Studio** qui a émis le ticket. **Chaque requête** sur
    `play_url` vérifie trois choses (lecture en cache, invalidée par le bus de révocation du §3.6) :
    - la session de jeu est valide ;
    - la session Studio liée est encore valide ;
    - l'utilisateur est encore membre.

    Retirer un membre, le déconnecter, recevoir un back-channel logout ou suspendre sa session Studio ferme donc son
    accès aux aperçus privés **à la requête suivante**, même si son cookie de jeu est encore présent.
  - Elle ne donne que la **lecture** de l'aperçu, des prévisualisations et des builds de l'instance. Aucune API du
    Studio n'est servie sur `play_url`.
- **Communication limitée Studio ↔ jeu.**
  - `postMessage` est utilisé avec une **origine cible exacte** des deux côtés (motif `rooms-bridge.ts:70-75`) et un
    schéma fermé de messages : `ready`, `select`, `dirty`, `saved{layout}`, `create`, `save`, `revision`.
  - Un `saved{layout}` n'est accepté **qu'en réponse** à un `save` émis par le Studio, avec un nonce, et **que pour la
    salle ouverte**. Il est validé par schéma. L'écriture reste faite par le Studio, au nom de l'utilisateur, sous son
    bail.
  - **Risque résiduel déclaré** : un code de jeu hostile peut altérer le layout que l'utilisateur est en train
    d'enregistrer, dans la salle qu'il édite.
- **En-têtes de l'origine de jeu** : CSP propre, `frame-ancestors` limité à `public_url`, aucune clé ni donnée Studio.
- **Tests** :
  - une page de jeu qui appelle l'API Studio est refusée (pas de cookie, Origin refusé, préflight refusé) ;
  - une page de jeu qui lit le stockage du Studio n'obtient rien ;
  - un `saved` non sollicité, ou pour une autre salle, est ignoré ;
  - un ticket rejoué ou expiré est refusé ;
  - un membre retiré, ou une session Studio terminée, perd l'accès aux aperçus à la requête suivante, cookie de jeu
    encore présent ;
  - Play et Rooms fonctionnent sous WebKit avec le blocage des cookies tiers par défaut (Playwright WebKit en CI, et
    Safari réel dans la passe `studio-hosted`).

### 6.2 4.2.1 : un aperçu **vivant**, P4 n'est pas encore livré

- Play et Rooms tournent sur **Vite en mode middleware**, servi sur `play_url`, derrière le ticket de jeu.
  - `server.fs.strict` est actif, avec `fs.allow` limité au cache de travail et au moteur.
  - Le HMR est **désactivé**.
  - Vite et le moteur font partie des dépendances d'exécution du paquet 4.2.1 (à confirmer par le spike S).
- Cet aperçu lit le **cache de travail**, qui suit la tête. Un import différé ou un asset chargé plus tard peut donc
  appartenir à une révision suivante.
- **Il est déclaré tel quel** : l'étiquette dit « aperçu vivant, non figé » et indique la révision de tête **au
  chargement**, à titre indicatif. Elle ne promet pas que tout ce qui est joué en vient.
- **En 4.2.1, P4 n'est pas livré.** La garantie « chacun sait exactement quelle version il regarde » vaut pour :
  - les éditeurs et les lectures (révision exacte, §4) ;
  - les diagnostics (révision exacte).

  Elle ne vaut pas pour l'aperçu de jeu. Cette limite est écrite dans les notes de version et dans SUPPORT.
- La route `/__layout` disparaît : l'éditeur sauve par l'API d'opérations, via le protocole de §6.1.
- Exposer Vite, même derrière ticket, est un risque inscrit au modèle de menaces. La 4.2.2 le retire.

### 6.3 4.2.2 : prévisualisation par révision (P4 livré)

- **Spike d'abord.** `patchGame` (`src/studio/demo-patch.ts:146`, utilisé par `src/main.ts:29-39`) prouve que le
  joueur sait démarrer un jeu modifié par des données. On mesure deux voies :
  - **(a)** un **bundle moteur par version**, plus un **paquet de contenu** par révision produit depuis le snapshot ;
  - **(b)** un **build complet** par révision, coalescé.

  Les deux sont produites par l'exécuteur (§3.8) depuis un **snapshot immuable**. Elles sont donc cohérentes par
  construction.
- Elles sont servies sur `play_url` à `/preview/<rev>/` et sont **immuables**. Le seuil de latence est fixé par la
  mesure, avec une cible de 5 s.
- **L'ADR 0026** porte sur les sauvegardes face aux révisions :
  - l'enveloppe est inchangée ;
  - l'empreinte et la révision sont stockées à côté de chaque emplacement ;
  - l'invite propose Reprendre, Redémarrer ou Rester.
- **Builds immuables** `/play/<n>`, dont le **dernier build vert** est toujours servi.
  - Une publication peut exiger une **recompilation fraîche** : la politique est décidée après mesure (§3.8).
  - Le build public est servi sur `play_url`, éventuellement sans authentification si l'owner le choisit.
- Vite quitte le serveur de production.

## 7. Release 4.2.1 « Shared Floor » : un jeu, plusieurs devs, en ligne, protégé par OIDC

**Résultat visible** :
- Le mainteneur déploie le paquet serveur sur une application Node.js native Clever Cloud, pointe vers Keycloak, invite deux ou trois personnes. Elles éditent
  le même jeu en même temps, chacune sur ses salles.
- Les refus et conflits sont clairs, et rien ne se perd.
- Chacun voit la révision qu'il regarde.

**Ordre** : A, puis **S** (le spike sur le runtime Clever, tôt, parce qu'il conditionne tout le déploiement), puis 1,
puis 2. Ensuite 3 en parallèle de 4. Puis 5. Puis I. Puis 6 et 7 en parallèle. Puis 8 et 9, puis le candidat
technique, puis R.

| PR | Branche | Contenu | Sortie |
|---|---|---|---|
| A | `docs/43-plan` (#127, révision 4) | Ce plan en révision 4 (OIDC, hébergé Node natif Clever, un jeu par instance, BYOK), D41 (formulation du mainteneur), ADR 0025 amendé, réservation de l'ADR 0027 (auth, sessions, jetons, secrets) et de l'ADR 0028 (exécution du contenu). Puis les **maquettes de l'étape 0** avec les vrais assets (artifact), validées par le mainteneur | Le mainteneur fusionne #127 et valide les maquettes |
| S | `spike/421-clever-runtime` | **Essai réel sur le runtime Node natif de Clever Cloud** (application jetable dans l'organisation du mainteneur, avec son accord ; outil `clever-tools`). On mesure et documente dans `docs/dev/SPIKE-4.2.1-CLEVER.md` :<br>– choix de la version de Node ; build et commande de démarrage ; installation depuis un lockfile ; `devDependencies` au runtime (nécessaires à Vite en 4.2.1) ;<br>– disque éphémère ou non ; comportement d'un redéploiement (chevauchement, SIGTERM, délai) ; health check ; mémoire ;<br>– variables d'environnement et secrets ;<br>– accès PostgreSQL et Cellar (`If-None-Match`, URL présignées) ;<br>– **dépendances lourdes** : `python3` avec numpy, PIL, scipy (installables ? par quel hook ?), ffmpeg, Chromium pour Playwright ;<br>– **isolation** : une seconde application `studio-worker` et la latence d'un aller-retour job snapshot → résultat ;<br>– SSE derrière le proxy (pas de mise en tampon, délais d'inactivité) ;<br>– **Safari** : origine de jeu même site ou intersite, cookies tiers bloqués par défaut, sans changer les préférences (§6.1) ;<br>– **reprise Postgres** : paramètres de session autorisés (`lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`) sur l'add-on, et mesure de la borne avec une pause après acquisition du verrou (§4) ;<br>– **worker** : une séparation effective entre superviseur et exécution est-elle possible sur un runtime natif ? Sinon, le risque du §3.8 est confirmé tel quel. | Un rapport chiffré. Chaque hypothèse « à confirmer » de ce plan est tranchée ou reportée avec une raison. Rien n'est livré aux utilisateurs |
| 1 | `refactor/421-ops-split` | **Découpage neutre** : le noyau d'opérations est extrait de `tools/studio/core.ts`, `assets.ts`, `apply.ts` et `source.ts` vers `studio-server/src/ops/`, avec des effets typés. `plugin.ts` l'appelle. Paramètre additif `dir` pour `bridge/src/migrations.ts` (comportement identique). Préfixe d'API configurable côté client : les chemins codés en dur (§1) passent par une constante. | Tests existants verts, aucun comportement changé, mutation `core` intacte |
| 2 | `feature/421-ops-journal` | P1 en local (SQLite, blobs fs, fsync, reprise vers l'avant) et P1 hébergé (Postgres + `BlobStore` s3 + cache matérialisé, §4). Révisions par fichier, époque, idempotence. **Garde unique** sur l'état final, dans un répertoire préparé. **Exécution du contenu derrière une interface `Executor`**, avec une première implémentation `local-child` : `importInChild` généralisé, environnement vidé, limites et échéance. Solve avec `timeLimitMs`, annulation, et une file de jobs bornée | Tests de pannes du §11 verts sur SQLite et Postgres ; set de mutation `studio-ops` en `MEASURED` |
| 3 | `refactor/421-single-entry` | Convergence des écrivains : MCP, `studio-apply`, `ids`, `i18n`, `voices`, `import-layout`, `storyboard`, `provenance` ; scripts Python via un répertoire de sortie puis une opération. Retrait de `/__layout`. Adoption des changements externes en local. Scanner statique (`writeFile*`, `copyFile*`, `rm`, `unlink`, `rename`, `open(…'w')` Python, spawns) + test bout-à-bout | Aucun écrivain hors noyau ; le Studio local se comporte comme avant |
| 4 | `feature/421-server` | Paquet `studio-server/` :<br>– `node:http` sur le motif du Bridge ;<br>– chargeur de configuration et de secrets (§4) ;<br>– `public_url` et `play_url` avec routage par `Host` ;<br>– trust-proxy pour le proxy Clever ;<br>– sondes `/livez`, `/startz`, `/readyz` (§4) ;<br>– logs JSON avec id de requête ;<br>– bail de service avec fencing vérifié **dans chaque transaction d'écriture**, `holdWrites`, SIGTERM comme simple raccourci (P8, §4) ;<br>– réponse enregistrée, retry après commit, issue de commit inconnue ;<br>– lectures par révision, jamais depuis le cache ; réconciliateur du cache ; événements après commit ;<br>– commandes `init`, `import`, `export`. | Scénarios du §4 verts (ancienne instance coupée, figée, sans SIGTERM ; écriture tardive refusée ; commit puis échec de matérialisation) sur SQLite et sur Postgres+MinIO |
| 5 | `feature/421-oidc` | §3.1 à §3.7 et §3.9 :<br>– RP OIDC ;<br>– sessions, rôles et invitations ;<br>– matrice de permissions ;<br>– **les quatre politiques HTTP** (cookie, Bearer, callback, back-channel) avec leurs exceptions ;<br>– en-têtes, limites de débit ;<br>– **révocation bornée** (vérification toutes les 5 min, refus définitif ou panne, *fail closed* à R, `revoked_before`, jetons Bearer ≤ 5 min, fermeture des flux en 5 s) ;<br>– device flow (`web-scumm studio login`) ;<br>– audit ;<br>– ADR 0027 (dont la dérogation « secrets en variables » sur Clever) ;<br>– modèle de menaces. | Matrices du §3.4 et du §3.6 vertes contre un OP de test, et contre Keycloak réel en CI ; set `studio-auth` en `MEASURED` |
| I | `feature/421-isolation` | Selon le spike S, implémentation `remote-worker` de l'`Executor` (§3.8) :<br>– application `studio-worker`, sans secret de plateforme ;<br>– superviseur de confiance et un processus neuf par job ;<br>– signature liant job, instance, époque, révision, hash de snapshot, paramètres, destination `staging/<job_id>/` et expiration ;<br>– usage unique ;<br>– URL présignées réservées au superviseur ;<br>– acceptation et publication par le Studio uniquement ;<br>– nettoyage vérifié et recyclage de l'instance ;<br>– repli `local-child` réservé au mode local.<br>**ADR 0028** : la frontière retenue, la place de la garde synchrone (mesure du p95 complet, §11), ce que prouve un verdict, et le risque résiduel. | Tests du §3.8 verts ; p95 complet mesuré, seuil écrit |
| 6 | `feature/421-leases-live` | P2 : carte des pans, baux via la file, fencing, mode exclusif. P7 : SSE `/events`, `GET /ops`, présence, reprise après reconnexion | Tests de concurrence à 3 clients verts |
| 7 | `feature/421-client` | Studio :<br>– connexion et déconnexion, page « accès non accordé », écran Membres (owner) ;<br>– auteur = identité de session (plus de `'you'`) ;<br>– bandeau de révision exacte pour les éditeurs et les lectures ;<br>– présence ;<br>– UI des baux (prendre, libérer, 423 avec brouillon, 409 avec diff) ;<br>– **iframes de jeu sur `play_url`** par ticket, `postMessage` à origine exacte avec schéma fermé et `saved` sollicité par nonce (§6.1) ;<br>– aperçu étiqueté « vivant, non figé » ;<br>– undo masqué en mode serveur.<br>Assistant en BYOK, avec `run_tests` et `screenshot` désactivés en hébergé. | E2E Playwright à 3 contextes (§11) et tests d'isolation navigateur du §6.1 verts |
| 8 | `ops/421-hosting` | **Déploiement Node natif de référence, sans Docker** :<br>– le paquet `web-scumm-studio-server` (et `web-scumm-studio-worker` si I le retient) contient le serveur, le Studio buildé, le moteur nécessaire à Vite en 4.2.1, un `package.json` avec `engines`, `scripts.build` et `scripts.start`, et un **lockfile** (`npm-shrinkwrap.json`, motif `writeLocked` de `pack.mjs`) ;<br>– un dépôt de déploiement modèle `ops/studio/clever/` : variables Clever documentées (version de Node, commande de démarrage, hooks de build si le spike en exige), aucun binaire système requis en 4.2.1 ;<br>– en 4.2.1, la découpe de planches et `prepare` (Python, ffmpeg) sont **indisponibles en hébergé**, ce que l'interface dit ; l'upload simple de son et de décor fonctionne.<br>**Guide** `docs/en|fr/STUDIO-SERVER.md` :<br>– création des applications Node (studio, worker) ;<br>– add-on PostgreSQL ;<br>– bucket Cellar et ses clés ;<br>– Keycloak managé (realm, client confidentiel avec PKCE obligatoire, back-channel logout, client public CLI avec device flow, mapper d'audience), ou un OP externe ;<br>– `min = max = 1` pour le studio ;<br>– deux domaines (`public_url`, `play_url`, de préférence sur deux sites différents) et TLS ;<br>– premier owner ;<br>– export.<br>Realm Keycloak de test versionné (`ops/studio/keycloak/realm.json`). **Compose facultatif** `ops/studio/compose.yml` (Postgres, MinIO, Keycloak) pour essayer en local, jamais requis. UPGRADING, SUPPORT (exception D40). | Installation depuis l'archive sur un Node 22 propre, démarrage, connexion Keycloak et e2e verts en CI. Le déploiement sur Clever a déjà été exercé par le spike S. L'exécution du guide final sur un vrai domaine est la passe `studio-hosted` (issue ouverte, signalée, non bloquante, D12) |
| 9 | `ci/421-gates` | `pack.mjs` + manifeste + lock pour `web-scumm-studio-server.tgz` (et `-worker`) ; SBOM ; `artifacts.mjs` ; `release.yml` ; jobs dans `candidate.yml` :<br>– `studio-e2e` : Playwright, avec des **conteneurs de service GitHub Actions** pour Postgres, MinIO et Keycloak ;<br>– `studio-install-smoke` : `npm ci --omit=dev` depuis l'archive dans un dossier vierge, puis démarrage et santé, sur le modèle d'`external-consumer`.<br>Couverture `studio-server/src/**` ; règle `ci-plan` ; `mutation-shards` sans `pg` codé en dur ; sets `studio-ops` et `studio-auth` en `GATED` ; passes `studio-hosted` et `studio-collab` dans `PASS_IDS` et `surfaces.json`. **Pas d'image ni de registre** | Candidat technique vert |
| R | `release/4.2.1` | Version, notes, CHANGELOG (assemblage des fragments), fiche de passes `docs/dev/passes/4.2.1.md`, issues `field-pass` ouvertes | Tag `v4.2.1` signé (D37), sur le run candidat exact |

**Critères de sortie de 4.2.1** :
- Aucune route n'est accessible sans session ou jeton valide, sauf `/auth/*`, la santé et les fichiers statiques de la
  page de connexion. C'est **testé en parcourant toutes les routes**.
- Un utilisateur authentifié mais non membre ne voit rien. Un reviewer n'écrit rien. Un dev n'écrit que sur ses pans.
- Les tests de pannes et de concurrence (§11) sont verts.
- Un redéploiement simulé (deux instances qui se chevauchent) ne perd et ne double aucune opération.
- Une révocation côté Keycloak (utilisateur désactivé) ferme la session en 15 min au plus. Un back-channel logout la
  ferme immédiatement.
- Les sets `studio-ops` et `studio-auth` sont bloquants. Les planchers de couverture sont posés à 2 points sous la
  mesure.
- L'installation se fait depuis l'archive versionnée et son lockfile, sur un Node 22 propre, **sans Docker**.
- L'ADR 0028 est écrit : il dit où s'exécute le contenu, ce que prouve un verdict, et quel risque résiduel est
  accepté.
- Le jeu n'est jamais exécuté sur l'origine du Studio. Les tests d'isolation navigateur (§6.1) sont verts.
- Les notes de version et SUPPORT disent que l'aperçu de 4.2.1 est vivant et que P4 arrive en 4.2.2.
- Les passes `studio-hosted` (déploiement réel sur une application Node.js native Clever Cloud, avec PostgreSQL,
  Cellar, Keycloak et un domaine TLS) et `studio-collab` (trois
  personnes, une coupure réseau, un redéploiement pendant l'édition) sont **ouvertes en issues et signalées** (D12).

## 8. Release 4.2.2 : l'atelier jouable

Le nom est à choisir par le mainteneur.

**Résultat visible** : chacun joue la révision commune sans serveur de dev, voit l'état de santé du jeu à chaque
révision, défait ses propres actions, et l'équipe publie des builds figés. Les assets complets (planches, `prepare`)
fonctionnent en hébergé.

| PR | Branche | Contenu |
|---|---|---|
| A | `docs/422-plan` | Plan 4.2.2 détaillé, ADR 0026, mesures du spike |
| 1 | `spike/422-preview` | Mesure des voies (a) et (b) du §6 sur le jeu d'exemple et sur un jeu avec du code local ; le seuil est écrit |
| 2 | `feature/422-preview` | Prévisualisation par révision depuis un snapshot immuable (§6.3), servie sur `play_url` à `/preview/<rev>/`, immuable et stockée dans Cellar ; coalescence ; invite de partie ouverte (Reprendre, Redémarrer, Rester) ; empreinte à côté de chaque emplacement de sauvegarde. Rooms passe en éditeur de prévisualisation, construit avec les outils d'édition comme le build de démo. **Vite quitte le serveur de production.** P4 est livré |
| 3 | `feature/422-health` | Santé par révision : validate, lint, solve (avec échéance), playtests en workers ; état *périmé* ; bissection « révision ayant introduit l'échec » |
| 4 | `feature/422-undo` | Undo et redo personnels : opération inverse, 409 si quelqu'un a touché le fichier depuis, 423 si le pan n'est plus tenu |
| 5 | `feature/422-builds` | Builds immuables : snapshot à une frontière d'opération, compilation par l'exécuteur, manifeste (époque, révision, hashes, moteur, commit, lockfile, diagnostics), `/play/<n>` sur `play_url`, dernier build vert. **Recompilation fraîche** disponible (reproductibilité et détection de contamination, §3.8). Son coût est mesuré avant de décider si elle devient obligatoire pour publier |
| 6 | `feature/422-assets` | Selon le spike S : Python 3 avec numpy, PIL et scipy épinglés (lock pip avec hashes) et ffmpeg, sur un **runtime natif Clever qualifié** (l'application de traitement Node avec un hook de build, ou une application native Python). **Jamais Docker.** Si aucun runtime natif qualifié ne les fournit, la découpe de planches et `prepare` restent **indisponibles en hébergé**, l'interface le dit, et ils restent disponibles en local. Appel par l'exécuteur (liste d'arguments fixe, limites). Opération exclusive avec progression en SSE et annulation |
| 7 | `feature/422-backup` | `studio-server backup` et `restore` (base + liste des blobs, registre de complétude, modes explicites comme D36) ; **expédition continue du journal** vers Cellar et rejeu après restauration ; RPO mesuré et affiché ; GC des blobs orphelins et du staging ; exercice de restauration en qualification |
| 8 | `ci/422-gates` | Jobs et passes (`studio-preview`), seuils, mutation |
| R | `release/4.2.2` | Comme 4.2.1 |

**Critères de sortie** :
- le seuil de prévisualisation est mesuré et tenu ;
- un diagnostic périmé est toujours signalé ;
- le manifeste d'un build correspond octet pour octet à son snapshot ;
- une restauration retrouve la révision sauvegardée, puis, par rejeu du journal expédié, la dernière op expédiée ; le
  RPO mesuré est affiché ;
- le coût de la recompilation fraîche est mesuré, et la politique de publication décidée ;
- le serveur de production n'embarque plus Vite en mode dev.

## 9. Release 4.2.3 : coordination et hébergement de production

**Résultat visible** :
- L'équipe s'organise dans le Studio : carte du scénario, commentaires ancrés, diff lisible.
- Les agents IA travaillent à distance par MCP sur le Studio hébergé.
- Le jeu part sur GitHub.
- Le déploiement Clever Cloud de référence est exécuté et documenté.

| PR | Branche | Contenu |
|---|---|---|
| A | `docs/423-plan` | Plan 4.2.3, réservations |
| 1 | `feature/423-map` | Regroupements transverses (personnage, énigme, chapitre) qui ne font que référencer, et **carte du scénario** (`scenario.map.json`, dérivé des ids et de la provenance IR) |
| 2 | `feature/423-comments` | Commentaires ancrés sur les ids stables (fils, résolu), ouverts aux reviewers ; `ids --lines` généralisé en opération exclusive ; les notes migrent vers ce modèle |
| 3 | `feature/423-diff` | Diff sémantique entre révisions et entre builds ; captures avant/après par Chromium dans l'exécuteur, **si un runtime natif Clever qualifié le fournit**. Sinon, les captures restent indisponibles en hébergé et disponibles en local |
| 4 | `feature/423-mcp-remote` | MCP distant en Streamable HTTP, protégé selon la spécification d'autorisation MCP (Protected Resource Metadata, jetons OIDC, audience) ; mêmes contrôles que l'API |
| 5 | `feature/423-git` | Export et push vers un dépôt Git (clé de déploiement ou GitHub App, secret en fichier), commits par lot avec `Co-authored-by` ; import depuis Git |
| 6 | `feature/423-engine-upgrade` | Montée de version du moteur pour le jeu hébergé (`migrate` en mode exclusif, vérifié par validate et solve, retour arrière par restauration) |
| 7 | `ops/423-reference` | **Déploiement de référence Clever Cloud exécuté** :<br>– runbook ;<br>– supervision : métriques (latence des ops, profondeur de file, conflits de bail, durée des jobs), OpenTelemetry en option ;<br>– alertes ;<br>– sauvegardes planifiées ;<br>– exercice de restauration ;<br>– procédure de montée de version (redéploiement à chevauchement, §4) ;<br>– option « traitement sans réseau sortant » si le runtime le permet. |
| 8 | `ci/423-gates` | Jobs et passes (`studio-mcp-remote`, `studio-oidc-generic` : un second fournisseur OIDC, par exemple GitLab ou Authentik, vérifié par une personne) |
| R | `release/4.2.3` | Comme 4.2.1 |

## 10. Documentation (chaque PR, en et fr)

- `docs/en|fr/STUDIO-SERVER.md` (nouveau) couvre :
  - l'architecture ;
  - le déploiement Clever Cloud pas à pas ;
  - le compose auto-hébergé ;
  - la configuration de Keycloak (realm, clients, mapper d'audience, back-channel logout, device flow) ;
  - un fournisseur OIDC générique ;
  - les rôles et invitations ;
  - le CLI et le MCP ;
  - les sauvegardes ;
  - les limites connues.
- `STUDIO.md` (mode serveur), `MCP.md` (client distant puis MCP distant) et `UPGRADING.md` (le mode local passe par le
  noyau).
- `SUPPORT.md` reçoit l'exception D40 et le statut de chaque surface (expérimentale tant que sa passe n'est pas faite,
  D18).
- Le modèle de menaces, les ADR 0025, 0026 et 0027, et des fragments `changes/` (pas d'édition directe de `LOG.md`).

## 11. Tests et vérification

- **Concurrence** (3 clients simulés, SQLite et Postgres) :
  - transactions multi-fichiers appliquées en entier ou pas du tout ;
  - 423 sur un pan tenu par un autre ;
  - 409 sur un fichier modifié entre-temps, et seulement sur ce fichier ;
  - plusieurs pans pris tous ou aucun ;
  - mode exclusif ;
  - rafale de 10 clients.
- **Pannes** :
  - kill -9 à chaque frontière (après les blobs, après le commit Postgres, pendant la re-matérialisation) ;
  - requête rejouée ;
  - bail expiré ou repris pendant qu'une requête est en vol ;
  - coupure réseau, puis reprise par curseur ;
  - changement d'époque ;
  - deux instances qui se chevauchent (P8) ;
  - Cellar indisponible (refus propre, rien n'est confirmé) ;
  - Postgres indisponible (écritures en attente, 503).
- **Invariant**, par test de propriété : toute opération confirmée **reste dans le journal**, avec sa réponse
  enregistrée. Son effet est présent dans la révision où elle a été confirmée. Dans toute révision suivante, il reste
  présent **sauf s'il a été remplacé par une opération confirmée plus tard**. Le build d'une révision r contient
  exactement l'état résolu à r.
- **Performance** : on mesure le **p95 complet** d'une opération, du point de vue du client : attente dans la file,
  préparation, garde (locale ou distante), commit et réponse.
  - Profil : 5 auteurs à une op toutes les 10 s chacun, plus des rafales, plus un job lourd en parallèle.
  - Le seuil est écrit avant la release, à partir de la mesure.
  - Si la garde distante (aller-retour de traitement) fait dépasser le seuil, l'ADR 0028 choisit entre une garde
    locale (avec son risque déclaré) et la validation groupée des opérations en attente. On ne promet pas de chiffre
    sans mesure.
- **Authentification** : matrice négative contre un fournisseur de test (`jose` déclaré en dépendance de dev, version
  exacte) :
  - `iss`, `aud`, `azp`, `nonce` ou `state` faux ;
  - jeton expiré ou futur ;
  - `alg: none` ou HS256 ;
  - `kid` inconnu, puis rotation des JWKS ;
  - id_token présenté comme Bearer ;
  - mauvaise audience ;
  - PKCE absent ;
  - redirect_uri différent ;
  - cookie sans `__Host-` ;
  - mutation sans `Origin` ou sans en-tête CSRF ;
  - invitation réutilisée ou email non vérifié ;
  - logout_token invalide ;
  - refresh refusé (session fermée).
- **Keycloak réel** dans le compose de qualification : connexion, back-channel logout, désactivation d'un utilisateur,
  device flow.
- **Permissions** : un test parcourt toutes les routes enregistrées, pour chaque rôle et pour un non-membre, et compare
  avec la matrice.
- **Isolation** :
  - en `local-child`, un contenu qui lit l'environnement n'y trouve aucun secret, et un contenu qui boucle est tué à
    son échéance ;
  - en `remote-worker`, un contenu hostile n'obtient aucun secret de la plateforme (l'application de traitement n'en
    a pas) ;
  - un résultat altéré (hash, schéma, taille, préfixe Cellar) est refusé, et un jeton de job rejoué ou expiré aussi.
- **E2E Playwright à trois contextes** (Chromium, puis WebKit) :
  - trois utilisateurs Keycloak se connectent ;
  - A prend la salle `garden`, B la salle `house` ;
  - éditions simultanées ;
  - C reviewer ne peut pas écrire ;
  - B tente `garden` et reçoit 423 avec son brouillon conservé ;
  - coupure réseau de A puis reprise ;
  - redéploiement pendant l'édition ;
  - à la fin, les trois voient la même révision et le jeu valide.
- **Garanties de frontière** : les matrices des quatre politiques HTTP (§3.4), les bornes de révocation (§3.6), l'isolation
  serveur (§3.8) et navigateur (§6.1), et les scénarios après commit et de bascule (§4).
- **Qualité** :
  - sets de mutation `studio-ops` et `studio-auth`, d'abord mesurés puis bloquants à chaque release ;
  - planchers de couverture ;
  - `npm run quality` jugé par son code de sortie ;
  - `npm run audit` ;
  - **une seule suite de tests à la fois** sur la machine du mainteneur.
- **Passes humaines** (issues `field-pass`, D12) :
  - 4.2.1 : `studio-hosted`, `studio-collab` ;
  - 4.2.2 : `studio-preview` ;
  - 4.2.3 : `studio-mcp-remote`, `studio-oidc-generic`.

## 12. Risques et points à confirmer

- **Le spike S tranche, sur le runtime Node natif de Clever Cloud** (documentation :
  https://www.clever.cloud/developers/doc/deploy/applications/nodejs/) :
  - choix de la version de Node ; build et commande de démarrage ; `devDependencies` ;
  - disque éphémère ;
  - redéploiement à chevauchement ;
  - SSE derrière le proxy ;
  - variables et secrets ;
  - Cellar (`If-None-Match`, URL présignées) ;
  - Keycloak managé (back-channel logout, device flow, mapper d'audience) ;
  - **Python, ffmpeg et Chromium** ;
  - latence vers une application de traitement.

  Chaque fait non confirmé reste marqué « à confirmer » dans le plan.
- **Isolation** : sans plusieurs utilisateurs système, la seule frontière réelle envisagée est une application séparée
  sans secrets de plateforme. Elle voit toutefois les données du projet, et un code hostile peut fausser les jobs
  suivants de la même instance de traitement jusqu'à son recyclage (§3.8). Si la garde synchrone ne peut pas y partir (latence), le risque résiduel est déclaré : les membres
  `dev` sont de confiance pour la garde.
- **Dépendances lourdes** : elles ne sont promises en hébergé que si un **runtime natif Clever** qualifié par le
  spike S les fournit (application de traitement Node avec hook de build, ou application native Python). Sinon, la
  fonctionnalité est **indisponible en hébergé**, l'interface le dit, et elle reste disponible en local. **Aucune
  fonctionnalité promise n'exige Docker**, même en repli.
- **Vite exposé en 4.2.1** : il reste derrière l'authentification, avec `fs.strict` et une version épinglée. Il est
  retiré en 4.2.2.
- **Secrets en variables d'environnement sur Clever** : c'est une dérogation à la règle de la maison, encadrée par §4
  et l'ADR 0027.
- **Un seul jeu par instance** : plusieurs jeux veulent dire plusieurs applications Clever. C'est assumé (D41-3).
- **Débit de la file unique** : on mesure le p95 complet, attente comprise (§11). Son seuil est écrit avant la
  release.
- **Deux domaines** : l'origine de jeu exige un second domaine. Le spike S confirme qu'une même application Clever peut
  servir deux domaines. Sinon, l'origine de jeu devient une seconde application.
- **Aperçu vivant en 4.2.1** : P4 n'est livré qu'en 4.2.2. C'est déclaré.
- **Passes humaines** : les 13 passes de 4.2 restent ouvertes. Les surfaces Studio et site changent, donc leurs passes
  sont à refaire ; les autres sont reportées par `field:carry` (D35, D40).

## 13. Méthode (rappels)

- **Avant tout code**, le plan dans Git est la source normative : #127 passe en révision 4, est fusionnée **par le
  mainteneur**, puis vient l'étape 0 (maquettes validées).
- Un worktree neuf par PR, créé depuis `origin/main`, dans `scratchpad/`.
- Une PR à la fois sur le même fichier partagé ; une suite de tests à la fois.
- Chaque PR passe par une relecture en second contexte automatisé (jamais présentée comme une revue indépendante).
  Le mainteneur relit avec Codex : chaque affirmation cite un fichier et une ligne.
- Le candidat technique avant la PR de release ; le tag désigne le run candidat exact ; il est signé avec le oui
  explicite du mainteneur (D37).
- Les PR de Dependabot sont traitées après chaque release, jamais au milieu.
- Numéros :
  - **D41** pour les décisions du jour ;
  - **ADR 0026** (sauvegardes face aux révisions, 4.2.2) ;
  - **ADR 0027** (authentification OIDC, sessions, jetons et secrets, 4.2.1) ;
  - **ADR 0028** (exécution du contenu et isolation, 4.2.1).

  Un ADR n'est jamais vide.

## 14. Décisions

### D39 — « Studio Server »

Le mainteneur a décidé, le 17 octobre 2026 :
- une **plateforme partagée** : une seule copie du jeu, éditée en direct ;
- des verrous explicites et des builds figés ;
- des CRDT reportés ;
- un chantier mené après 4.2.0 stable ;
- les principes de ce plan (§3) et un découpage en trois étapes (§5).

Citation : « go to 4.3 », le 17 octobre. D40 fixe ensuite la numérotation.

### D40 — Trois patchs 4.2.x, et non une 4.3

Le 17 octobre, le mainteneur a fixé la numérotation et le nom de la première étape :
- **4.2.1 « Shared Floor »** (socle partagé) ;
- **4.2.2** (atelier jouable) ;
- **4.2.3** (coordination avancée).

Citations : « enfaite 4.2.1 4.2.2 4.2.3 » ; « Shared Floor » : « ok ».

Ce que cela implique :

- **Exception de version, sur le modèle de D14.** `docs/en|fr/SUPPORT.md` dit qu'un patch « fixes; it never changes a
  public name or a format ». Comme la ligne 4.1.x avant elle, la ligne **4.2.1 → 4.2.3 peut ajouter** : un outil, une
  commande, une route du Studio Server. Elle **ne peut pas changer ni retirer** un nom public ou un format de l'API
  publique (`src/engine` public, format de contenu, enveloppe de sauvegarde).
  - Si l'ADR 0026 conclut qu'il faut changer l'enveloppe, ce changement attend une 4.3.
  - La PR de release de 4.2.1 ajoute cette exception à SUPPORT, dans les deux langues.
- **Le mode local du Studio** reste compatible (§2). Ce qui change pour un auteur est décrit dans UPGRADING à chaque
  étape.
- **Passes humaines de 4.2** (D38). Elles se font sur un candidat 4.2.x et restent valables si leur surface ne change
  pas (D35, `field:carry`). Les surfaces Studio et site touchées par une étape exigent une nouvelle passe ; les autres
  sont reportées avec leur attestation.

### D41 — Hébergement, droits, instance, assistant

Le mainteneur a décidé, le 17 octobre 2026 :
1. « **L'hébergement de référence utilise une application Node.js native Clever Cloud, PostgreSQL, Cellar et Keycloak
   ou un fournisseur OIDC compatible. Docker n'est pas requis. Les traitements nécessitant des dépendances système
   sont qualifiés sur ce runtime ou exécutés dans un service séparé.** » Docker Compose reste une commodité de test
   facultative.
2. **Les droits vivent entièrement dans le Studio.** OIDC ne fournit que l'identité.
3. **Un jeu par instance.**
4. **L'assistant reste en BYOK.** Aucun secret de fournisseur LLM n'est stocké côté serveur.

### Numéros réservés
- **ADR 0025** : le Studio Server (P1 à P8, adaptation hébergée).
- **ADR 0026** : les sauvegardes face aux révisions (4.2.2).
- **ADR 0027** : authentification OIDC, sessions, jetons et secrets (4.2.1).
- **ADR 0028** : exécution du contenu et isolation (4.2.1).
- L'ADR 0022 reste réservé au DSL.
- Un ADR n'est jamais vide.

## Annexe A. Principes P1 à P8 (révision 3, en vigueur)

> Le corps du plan adapte ces principes à l'hébergé et prévaut en cas de divergence :
> - P1 : durabilité par commit Postgres et blobs Cellar, §4 ;
> - P3 : exécution du contenu, §3.8 ;
> - P4 : aperçu vivant en 4.2.1, P4 en 4.2.2, §6 ;
> - P6 : jetons OIDC et non Biscuit, §3.5 ;
> - P8 : bail de service et reprise bornée, §4.
>
> Les renvois de section écrits à l'intérieur de cette annexe (« §1.1 », « §4 », « §P2 ») visent la numérotation de la
> révision 3. Les constats correspondants sont à l'annexe B.


### P1. La transaction est l'unité de modification

- **Une opération** porte :
  - un identifiant fourni par le client ;
  - l'auteur ;
  - les pans revendiqués, avec leurs jetons de fencing ;
  - pour chaque fichier touché, la révision de ce fichier vue par le client ;
  - une liste d'effets typés : créer, remplacer ou supprimer un fichier, ou faire une édition structurée qui se
    résout en contenu.
- **Une file par projet**, tenue par le seul processus serveur (P8). Elle remplace les files de `core.ts` et
  d'`assets.ts`.
- **Application**, dans la file :
  1. **Préparer.** Calculer le contenu après de chaque fichier. Ce contenu va dans un **magasin de blobs adressé par
     contenu** (`.studio/blobs/<sha256>`), avec fsync. Le contenu avant y est déjà, puisque chaque état confirmé y est
     stocké. Les binaires ne passent donc jamais par le journal. Un fichier absent est représenté par une sentinelle
     `absent`.
  2. **Valider** l'état final (P3).
  3. **Point de linéarisation.** Vérifier que les jetons de fencing sont courants (P2) et que la révision de chaque
     fichier touché n'a pas bougé (sinon 409). Écrire ensuite l'**intention** au journal : l'id d'opération, la
     révision cible, et pour chaque fichier le chemin, le hash avant et le hash après (ou `absent`). Faire un fsync.
     Une fois journalisée, l'opération **se termine même si un bail expire ensuite**.
  4. **Appliquer**, fichier par fichier :
     - écrire un temporaire, faire un fsync, le renommer, puis faire un fsync du répertoire ;
     - créer d'abord les répertoires nouveaux, avec un fsync de leurs parents ;
     - pour une suppression : `unlink`, puis fsync du répertoire.
  5. **Confirmer.** Écrire la révision, le résultat et l'association fichier → révision, puis faire un fsync.
  6. **Répondre et diffuser.**
- **Reprise au démarrage, toujours vers l'avant.** Une intention journalisée a déjà été validée. On la reprend donc
  fichier par fichier :
  - si le fichier est à son hash après, il est déjà appliqué ;
  - s'il est à son hash avant, on l'applique depuis le blob après ;
  - on confirme ensuite.

  Un fichier qui ne correspond à aucun des deux hashes met le projet en **maintenance**. On ne devine pas.
- **Échec en cours de processus** (par exemple ENOSPC au deuxième renommage) : on restaure les fichiers déjà renommés
  depuis leurs blobs avant, puis on marque l'intention `aborted`. Si la restauration échoue elle aussi, le projet passe
  en maintenance.
- **Temporaires abandonnés.** Au démarrage, on supprime les `*.tmp` restants, après avoir journalisé leur liste.

### P2. Chaque fichier a un seul pan d'écriture

- **Le propriétaire est déterminé par le fichier**, pas par la provenance IR, qui ne couvre pas les ids écrits par du
  code. La carte des pans est générée et testée. **Chaque fichier de `games/<id>/` appartient à exactement un pan,
  sinon la génération échoue.** Pour le jeu d'exemple :

| Pan | Fichiers |
|---|---|
| `room:<id>` | `rooms/<id>.ts`, `layout/<id>.json` |
| `game` · `items` · `cast` · `rules` | `game.ts` · `items.ts` · `cast.ts` · `rules.ts`, chacun le sien |
| `story` | `storyboard.json`, `storyboard.md`, `STORY.md`, `prompts.md` |
| `lang:<code>` | `locales/<code>.json` |
| `voices` | `voices.json` (un fichier indexé par langue, `core.ts:600-611`, donc un seul pan tant qu'il n'est pas découpé) |
| `assets` | `art/`, `audio/`, `assets.gen.json`, `talk-kits.json`, `provenance.json`, `provenance.lock.json`, et ce qu'`assets` écrit dans `public/assets` |
| `notes` | `notes.json` (créé à la demande) |
| `meta` | `index.ts`, `site.json`, `e2e.mjs`, `ending.config.example.ts`, `ids.paths.json`, `ids.migration.json` |
| `playtests` | `playtests/` |

- **Les regroupements de la carte** (personnage, énigme, chapitre, à l'étape 3) ne font que **référencer** des
  éléments. Ils ne verrouillent rien.
- **Une opération multi-pans** revendique tous ses pans d'un coup, dans un ordre fixe. Si un seul est tenu par
  quelqu'un d'autre, c'est un refus immédiat (423), sans attente et sans acquisition partielle. C'est le cas de
  `i18n`, qui écrit la base et la cible, et d'un objet créé dans une salle puis référencé dans une autre.
- **Mode exclusif** pour les opérations qui touchent tout le jeu (`ids`, une migration, `prepare` des assets). Elles
  prennent un **bail de projet exclusif**. Il n'est accordé que si aucun pan n'est tenu, et il bloque les nouvelles
  prises pendant sa durée. C'est le motif `exclusive`/`serving` de la migration Bridge `0005`.
- **Baux et fencing.**
  - Les baux sont pris, renouvelés et repris **par la file elle-même**, comme des opérations. Ils sont donc ordonnés
    avec les écritures, et l'heure vient du store (motif `bridge/src/maintenance.ts`).
  - Valeurs initiales : **TTL de 120 s**, renouvelé par le battement de présence (**30 s**). Ce sont des paramètres de
    projet.
  - Chaque prise incrémente un **jeton de fencing** monotone par pan, vérifié au point de linéarisation (P1, étape 3).
    Une requête de l'ancien détenteur, même déjà en vol, est refusée en 423 après expiration ou reprise.
  - Le client garde son brouillon refusé localement : il peut le copier ou le réessayer après une nouvelle prise.
  - Une reprise par un `owner` est une opération journalisée, qui nomme l'ancien détenteur.

### P3. Une garde de validation unifiée, sur l'état final, hors du processus serveur

- **Toutes les écritures** passent par la même garde : validate, plus le contrôle propre au type (parse, schéma, id).
  Elle juge l'**état final de la transaction**. « Créer l'objet + le référencer ailleurs » passe en une transaction.
- **Règle de `guarded`, conservée** : une transaction qui **ajoute** des erreurs est refusée en 422, avec la liste. Les
  erreurs déjà présentes ne bloquent pas, ce qui permet de réparer progressivement. Les erreurs de la révision courante
  sont mises en cache : **une seule validation par opération**, au lieu de deux.
- **L'état préparé est un vrai répertoire**, pas des fichiers isolés. C'est une copie du jeu par liens physiques, où
  les fichiers touchés sont remplacés, placée dans un espace qui résout `@engine` et les mini-jeux comme la racine.
  validate y lit tout depuis le disque, comme aujourd'hui.
- **validate s'exécute dans un processus enfant** (`importInChild`, `core.ts:97`, généralisé), pour deux raisons :
  - un long serveur ne cumule pas les namespaces de `tsxImport` ;
  - le code de contenu ne voit pas les secrets du serveur (§4).
- **Débit.** Le temps par opération est mesuré à l'étape 1 sur le jeu d'exemple : préparation, validation et
  application. Le seuil est écrit avant la release de l'étape, au p95. Le solveur et les playtests restent hors de la
  garde synchrone, et alimentent la santé par révision (P5).

### P4. La prévisualisation commune est un chantier explicite

`src/main.ts:4` importe `@game` statiquement. Diffuser des événements ne suffit pas à mettre à jour un jeu jouable.

- **Étape 1.** Play joue l'état local du serveur, comme aujourd'hui, mais il est **étiqueté** : « révision N au
  chargement ». Il est marqué *périmé* dès qu'une révision plus récente existe, et ne se recharge jamais seul.
- **Étape 2.** Le serveur produit une **prévisualisation par révision** : un build du jeu dans un répertoire isolé,
  immuable une fois produit, servi sous `/preview/<rev>/`. Si plusieurs révisions arrivent pendant un build, seule la
  dernière est construite. La prévisualisation affiche sa révision.
- **Seuil.** Au plus **5 s** entre la confirmation d'une opération et sa prévisualisation, sur le jeu d'exemple. C'est
  une cible : le seuil définitif est **écrit à partir de la mesure, avant la release de l'étape 2**.
- **Une partie ouverte n'est jamais rechargée en silence.** À l'annonce « révision N disponible », le joueur choisit
  entre **Reprendre** (si compatible), **Redémarrer** ou **Rester** sur sa révision, affichée en clair.
- **Sauvegardes et révisions**, tranché dans l'**ADR 0026** (étape 2) :
  - **Par défaut, l'enveloppe ne change pas** : elle est en `strictObject`, donc un champ nouveau ferait refuser les
    sauvegardes écrites par une prévisualisation 4.2.x par un lecteur 4.2.0 hors ligne. La prévisualisation garde, **à côté** de chaque emplacement,
    l'empreinte `GameFingerprint.logic` et la révision où il a été écrit.
  - Toutes les révisions partagent une origine, donc IndexedDB. Charger un emplacement écrit à une autre révision
    **passe toujours** par l'invite.
  - **« Compatible »** veut dire : empreinte logique identique. Sinon, l'invite propose une **reprise à risque** et
    liste ce que l'élagage de `parseSave` retirerait. Le choix par défaut est Redémarrer.
  - Changer l'enveloppe elle-même reste possible, mais seulement par la porte de stabilité
    (`docs/dev/DSL-STABILITY.md`), avec sa migration.

### P5. Tout porte une révision

- **Le compteur de révision** est monotone par projet et incrémenté par chaque opération confirmée. Il est associé à
  une **époque de projet** (identifiant aléatoire à la création), pour qu'un store restauré ou perdu ne réutilise
  jamais un numéro. Le Studio affiche « révision 412 » en permanence.
- **Chaque fichier garde sa dernière révision** : c'est la base du 409 de P1. Une écriture ailleurs dans le projet ne
  rend donc pas les autres pans périmés.
- **Diagnostics.** Validate, lint, solve et playtests tournent en tâche de fond. Chaque résultat porte **sa
  révision**. Un résultat plus ancien que la révision courante est affiché *périmé*.
- **Pas de coupable.** On parle de « **révision ayant introduit l'échec** », trouvée par bissection sur les snapshots,
  jamais d'auteur fautif : une incompatibilité peut venir de deux modifications raisonnables.
- **Snapshots.** Un snapshot est pris **à une frontière d'opération**, sans bloquer la file. On copie l'association
  fichier → blob de la révision ; les blobs sont immuables, puis matérialisés par liens physiques dans un répertoire
  isolé. La compilation se fait là.
- **Manifeste de build.** Il identifie :
  - l'époque et la révision ;
  - le hash de chaque fichier du jeu (sources et assets) ;
  - la version du moteur et le commit du dépôt ;
  - le lockfile ;
  - les diagnostics **de ce snapshot**.

### P6. Durabilité et entrée unique dès le socle

- **Idempotence.** Un identifiant d'opération rejoué renvoie le résultat enregistré, sans seconde application. Les ids
  sont ceux du **journal**, conservés aussi longtemps que lui : pas de table à durée limitée.
- **Confirmation** seulement après les fsync de P1.
- **Reconnexion.** Le client envoie l'époque et la dernière révision vue. Il reçoit la suite des opérations, ou une
  resynchronisation complète si l'époque diffère ou si la suite n'est plus disponible. On ne saute jamais un trou de
  révisions en silence.
- **Entrée unique.** Studio, assistant (`apply.ts`), MCP, outils d'auteur (TS et Python) et assets passent par l'API.
  - En mode serveur, MCP et CLI sont des clients authentifiés par un jeton d'accès OIDC (§3.5).
  - La route `POST /__layout` est retirée.
- **Changements externes.** On les détecte par **comparaison de hashes** avec l'état confirmé, jamais par les seuls
  événements `fs.watch`, qui réagissent aussi aux propres écritures du serveur.
  - En mode local, un changement externe est **adopté** comme une opération d'auteur `external`.
  - En mode serveur, il met le projet en maintenance.
- **Historique Git (nouveau).** L'autosave Git est l'historique lisible, pas la garantie :
  - un commit par lot de révisions, avec `Co-authored-by` ;
  - exécuté **sous la file**, avec son propre index (`GIT_INDEX_FILE`) ;
  - en mode serveur, aucun `git` ni hook externe sur l'arbre du serveur.

### P7. Transport : SSE et HTTP par curseur

D17 ne gouverne pas le Studio (D23). On reprend pourtant son motif, éprouvé dans le Bridge :
- **un flux SSE par projet** pour les révisions confirmées (id d'opération, révision, auteur, pans et fichiers
  touchés), les baux, la présence, les diagnostics et les builds ;
- **une lecture HTTP par curseur** (`GET /ops?epoch=…&after=<rev>`) qui donne les mêmes événements et sert à la
  reprise ;
- **la présence** passe par un battement HTTP, qui renouvelle aussi les baux.

Un WebSocket ne serait envisagé que si une mesure montre que SSE et HTTP ne tiennent pas.

### P8. Un seul processus écrivain par projet

- Le serveur prend un **bail de service par projet** dans le store, avec fencing, avant d'ouvrir la file.
- Une seconde instance (déploiement progressif, redémarrage en double) est refusée, et ses requêtes renvoient 503.
- Un déploiement arrête l'ancienne instance avant que la nouvelle ne prenne le bail.

## Annexe B. Constats détaillés sur les écrivains et le Studio (`a0ce19d`, révision 2)

**Écrivains.** Le Studio n'a pas un seul point d'entrée des écritures, mais une dizaine :

- `serial` (`tools/studio/core.ts:176-182`) est une chaîne de promesses propre à un processus.
- `tools/studio/assets.ts:297-302` tient **sa propre** file. `uploadSheet` (`:527`) écrit en `:571`, `:616`, `:660`
  et `:683`, et supprime en `:638` et `:681`. `prepare` lance `npm run assets` (`:688`). Une partie des écritures
  sort de `games/` et va dans `public/assets` (`:294`).
- `tools/mcp/server.ts:18` (`npm run mcp`) crée un second `createStudio`, dans un autre processus, avec sa propre file
  et sa propre pile d'undo. `studio-apply` fait de même.
- Des outils d'auteur écrivent directement :
  - `tools/ids.ts:85,94,118,120` ;
  - `tools/i18n.ts:39,44-45` (la locale de base et la cible ensemble) ;
  - `tools/voices.ts:83` ;
  - `tools/pages/import-layout.ts:142` ;
  - `tools/pages/storyboard.ts:356` ;
  - `tools/provenance.ts:55` ;
  - `tools/assets.py:216` (`assets.gen.json`) ;
  - `tools/talk-apply.py:13` et `cut-sheet.py` (`art/`).
- La route `POST /__layout/<room>` (`tools/vite/plugins.ts:33`) est authentifiée par `authorizeStudioRequest`
  (`:34`). Elle écrit pourtant le layout (`:57`) sans file, sans validation et sans undo.
- `core.ts:553` écrit `storyboard.md`.
- Les agents et les éditeurs de texte qui écrivent directement les fichiers font partie du flux documenté
  (`AGENTS.md:70-74`, `tools/studio/plugin.ts:197`).

**Garde de validation.**

- `guarded` (`core.ts:322-339`) annule en 422 une écriture qui ajoute des erreurs, mais seuls `setValue` (`:313`) et
  `setLayout` (`:408`) l'appellent. Elle valide deux fois par écriture (`:323`, `:326`).
- La validation lit le disque :
  - elle importe `index.ts` du jeu (`core.ts:186`) et les mini-jeux du moteur depuis la racine (`:627`) ;
  - elle lit les layouts « as it is on disk » (`:575`) ;
  - `tsxImport` crée un namespace neuf à chaque appel (`:87-91`) ;
  - `importInChild` (`:97`) existe déjà : un processus enfant qui ne renvoie que des données.

**Écritures multi-fichiers, durabilité, undo.**

- `addEntity` écrit la salle (`core.ts:463`) puis le layout (`:470`) : deux écritures et deux entrées d'undo.
- `writeAtomic` (`core.ts:231-240`) écrit un temporaire `.<pid>.tmp` puis le renomme, sans fsync. `null` supprime le
  fichier (`:232`). Les notes, le storyboard et les assets passent par `writeFileSync`.
- La pile d'undo est globale et plafonnée à 200 entrées (`core.ts:228-249`). `step` lève 409 si le fichier a changé
  (`:274`). Les notes et le storyboard n'y entrent pas (`:487`, `:512-539`).
- Le Studio ne fait aucun autosave Git : rien de tel dans `tools/studio/`.

**Identité, diffusion.**

- `tools/studio/security.ts` vérifie l'hôte et l'origine. En LAN, un jeton **unique pour tous** (`:68-86`).
- `GET /__studio/api/events` (`tools/studio/plugin.ts:245-258`) émet `{type:'changed', file}` depuis un `fs.watch`
  récursif (`:198-216`). Le watcher réagit aussi aux propres écritures du Studio. Ces événements ne portent ni auteur,
  ni révision, ni curseur de reprise.

**Jeu jouable et sauvegardes.**

- `src/main.ts:4` importe `@game`, que `vite.config.ts:159` résout vers `games/<GAME>/index.ts`.
- Les iframes Play (`src/studio/play.ts:26`) et Rooms (`src/studio/rooms-bridge.ts:43`) se rechargent par le
  rechargement complet de Vite. La page Studio le refuse (`src/studio/main.ts:36-40`) et suit le SSE.
- L'enveloppe V4 (`src/engine/core/save.ts:73-81`) est un `z.strictObject`. Elle porte `gameId`, `gameSaveVersion`,
  `savedAt`, `state` et `variant` (dont `variant.hash`, `src/engine/core/remix/story.ts:40`).
- Les sauvegardes n'ont **aucune empreinte de contenu** :
  - `GameFingerprint` (`src/engine/core/fingerprint.ts:21-26`) n'y entre pas ;
  - le chargement élague les items, salles et acteurs inconnus au lieu de refuser (`save.ts:209-235`) ;
  - le format de sauvegarde est une surface stabilisée (`docs/dev/DSL-STABILITY.md:41`).

**Ids et provenance.**

- Les répliques ne reçoivent un id stable qu'avec `ids --lines` (`src/engine/core/content-ids.ts:137-144`).
- Les clés d'entité ne sont uniques que par salle (`core.ts:442`).
- La provenance IR (`src/engine/core/ir.ts:32-35`, `provenanceOf` `:505`) n'a pas d'entrée pour un id écrit par du
  code (`:500-502`).

**Bridge.**

- Les baux de maintenance (`bridge/src/maintenance.ts`, migration `0005`) prennent l'heure de la base et refusent au
  lieu d'attendre.
- Sur Postgres, un verrou consultatif accompagne le bail (`maintenance.ts:7-8`).
- Il n'y a **aucun jeton de fencing**, et les écritures ordinaires ne vérifient pas le bail en SQL.
- Biscuit : `bridge/src/biscuit.ts`.

**Décisions en vigueur.**

- D17 (`DECISIONS.md:22`) livre le joueur en SSE plus une lecture HTTP par curseur. D23 (`:30`) restreint le « no
  WebSocket » au Bridge et à la PWA, et admet un WebSocket local. D17 ne gouverne donc pas le Studio.
- La règle 10 de la charte (`CHARTER.md:40-42`, « no realtime scripting ») porte sur le contenu des jeux.
- L'ADR 0002 dit que `games/` ne contient que des données. C'est une convention : les fichiers de contenu sont des
  modules TypeScript, et valider ou compiler les **exécute**.

**Conséquence.** Le socle partagé doit d'abord **faire converger toutes les écritures** vers une seule API
transactionnelle, puis rendre l'arbre du jeu inaccessible en écriture à tout le reste. C'est un prérequis, pas un
détail.

## Annexe C. Historique des relectures

- **Mainteneur, 17 octobre, après la révision 2** : numérotation en 4.2.1, 4.2.2 et 4.2.3, nom « Shared Floor » (D40).
  Le fichier est renommé de `PLAN-4.3-STUDIO-SERVER.md` en `PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`.

- **Mainteneur, 17 octobre**, sur la proposition précédente : les sept principes, le découpage en trois étapes et les
  tests de pannes.
- **Second contexte de lecture automatisé, 17 octobre**, sur la révision 1. Toutes les références du §1.1 ont été
  ouvertes : la plupart étaient exactes, et les imprécisions sont corrigées ci-dessus. Corrections apportées :
  - **P0** : la reprise ne pouvait pas revenir en arrière, puisque le journal n'avait que des hashes. Elle se fait
    maintenant vers l'avant, avec un magasin de blobs et une sentinelle `absent`, et les répertoires sont fsyncés.
  - **P1** :
    - la carte des pans n'était pas complète pour le jeu d'exemple : table du §P2, pan `voices` unique, mode
      exclusif ;
    - le 409 portait sur la révision du projet ; il porte maintenant sur celle de chaque fichier ;
    - le point de linéarisation était mal placé, et les baux ne passaient pas par la file ;
    - validate lit le disque : l'état préparé est un vrai répertoire, avec un processus enfant ;
    - les secrets étaient lisibles par le code de contenu ;
    - les changements externes en mode local n'étaient pas traités ;
    - aucun bail ne garantissait une instance unique (P8) ;
    - l'enveloppe de sauvegarde est en `strictObject`, et IndexedDB est partagée entre révisions ;
    - Play n'était pas étiqueté à l'étape 1 ;
    - la passe humaine était bloquante, contrairement à D12 ;
    - l'ADR 0025 et l'ADR 0026 se contredisaient.
  - **P2** :
    - l'idempotence s'appuie maintenant sur le journal ;
    - l'autosave Git est nouveau et passe sous la file ;
    - les pans globaux sont séparés ;
    - le propriétaire est déterminé par le fichier ;
    - le seuil de 5 s est une cible ;
    - les snapshots ne bloquent plus la file ;
    - une époque de projet est ajoutée ;
    - le contrôle des écrivains est élargi ;
    - le TTL et le battement sont fixés ;
    - le LOG passe en fragment `changes/`.
- **Mainteneur, 17 octobre, révision 4** : quatre décisions (D41) — hébergement de référence sur Clever Cloud, droits
  gérés entièrement dans le Studio, un jeu par instance, assistant en BYOK. Puis le **runtime Node.js natif** au lieu
  de Docker. Ensuite deux lectures avec Codex :
  - la première a demandé les quatre politiques HTTP, des bornes de révocation, l'origine de jeu séparée, le protocole
    après commit, les lectures par révision, l'aperçu vivant assumé (P4 en 4.2.2), la bascule sans SIGTERM, l'absence
    de repli Docker, la reprise par rejeu du journal et le p95 complet ;
  - la seconde a demandé le cookie de jeu compatible Safari, à trancher par le spike, les timeouts Postgres, la
    distinction entre bail expiré et nouveau propriétaire, et la fin de la promesse d'invisibilité des capacités du
    worker. La recompilation fraîche est désormais présentée comme un contrôle de reproductibilité.
  - Verdict : « je validerais le cap et le lancement du spike S ».
