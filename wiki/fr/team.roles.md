# Rôles et actions : la matrice complète

Sur un Studio d'équipe, chaque membre a un rôle : `owner`, `dev` ou `reviewer`. Cette page liste chaque route du
Studio Server et le rôle qu'elle demande, lus dans le code : le contrôle d'accès
([`auth/gate.ts`](../../studio-server/src/server/auth/gate.ts)), le rôle de chaque route d'API (`roleFor` dans
[`http.ts`](../../studio-server/src/server/http.ts)), les routes de l'owner
([`auth/routes.ts`](../../studio-server/src/server/auth/routes.ts)) et la table de l'API
([`ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="how-to-read"></a>

## Comment la lire

- Les rôles sont ordonnés : `reviewer` < `dev` < `owner`. Une route qui demande `dev` est ouverte aux owners aussi.
- **La règle** : un `GET` (et un `POST` qui ne fait que lire, comme une vérification) demande un reviewer ; toute
  autre écriture demande un dev ; les membres, les invitations, l'audit et quelques actions sur le jeu entier
  demandent un owner. Les exceptions figurent dans chaque tableau.
- En dessous du rôle demandé, la réponse est **403** `this needs the role <rôle>`. Une personne connectée qui n'est
  pas membre reçoit **403** `not a member of this project`. Sans session ni jeton : **401**.
- Le rôle est vérifié à chaque requête, avec le cookie de session (le navigateur) ou un jeton d'accès Bearer (la CLI,
  les scripts, le MCP). Un rôle changé ou un membre retiré prend effet à sa requête suivante.
- Les routes ci-dessous sont sous l'URL publique du Studio. L'origine du jeu (`playUrl`) a ses propres règles, à la
  fin.

<a name="owner"></a>

## `owner`

Tout ce que peut un dev, plus : les membres, leurs rôles et leurs sessions, les invitations, le journal d'audit ;
reprendre un pan ; le bail exclusif à la main ; pousser vers Git et importer depuis Git ; la montée de version du
moteur ; reconstruire à neuf un build publié ; faire entrer les notes comme commentaires ; annuler le job de n'importe
qui. Le dernier owner ne peut être ni rétrogradé ni retiré.

<a name="dev"></a>

## `dev`

Écrit le jeu, pan par pan : salles, textes, valeurs, storyboard, regroupements de la carte, notes, voix, uploads et
découpes, Prepare, annulation et rétablissement de ses propres opérations, publication d'un build, demande d'une
bissection, prise et rendu de pans. Résout n'importe quel fil de commentaires. Annule les jobs qu'il a lancés.

<a name="reviewer"></a>

## `reviewer`

Lit et joue : toutes les lectures du jeu et du Studio, les vérifications (validateur, solveur, lint…), les aperçus et
les builds, le flux en direct. N'écrit aucun fichier du jeu. Commente, modifie ses propres commentaires, et résout ses
propres fils. Ne tient aucun bail.

<a name="matrix-game"></a>

## Le jeu : lectures et modifications

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/game`, `/api/room/<id>`, `/api/ir`, `/api/graph`, `/api/history` | oui | oui | oui |
| `GET /api/storyboard`, `/api/groupings`, `/api/map`, `/api/notes` | oui | oui | oui |
| `GET /api/voices`, `/api/voices/<lang>`, `/api/voices/<lang>/csv`, `/api/hero-matrix` | oui | oui | oui |
| `GET /api/diff/<a>..<b>` | oui | oui | oui |
| `GET /api/diff/<a>..<b>/captures` (501 sur un Studio hébergé) | oui | oui | oui |
| `PUT /api/room/<id>/layout`, `/text`, `/value` ; `POST /api/room/<id>/add` | non | oui | oui |
| `PUT /api/room/@game/value` (les objectifs du jeu) | non | oui | oui |
| `PUT /api/storyboard`, `POST /api/storyboard/markdown` | non | oui | oui |
| `PUT /api/groupings` | non | oui | oui |
| `POST /api/notes`, `PUT /api/notes/<id>`, `DELETE /api/notes/<id>` | non | oui | oui |
| `PUT /api/voices/<lang>/<id>` | non | oui | oui |
| `POST /api/undo`, `POST /api/redo` (vos propres opérations) | non | oui | oui |

<a name="matrix-checks"></a>

## Vérifications et historique

| Route | reviewer | dev | owner |
|---|---|---|---|
| `POST /api/validate`, `/report`, `/puzzle`, `/coverage`, `/playtests`, `/lint`, `/solve` | oui | oui | oui |
| `POST /api/screenshot` (501 sur un Studio hébergé) | oui | oui | oui |
| `GET /api/revision`, `GET /api/ops?after=<rev>` | oui | oui | oui |
| `POST /api/health/bisect` `{good, bad}` | non | oui | oui |

Ces `POST` ne font que lire : ils prennent leurs options dans un corps, ne demandent aucun bail, et ne sont jamais
refusés pour un pan.

<a name="matrix-live"></a>

## Direct, présence et pans

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/events` (le flux en direct) | oui | oui | oui |
| `POST /api/presence` (le battement ; il renouvelle aussi les baux d'un dev ou d'un owner) | oui | oui | oui |
| `GET /api/leases` | oui | oui | oui |
| `POST /api/leases` `{spans}`, `POST /api/leases/release` `{spans?}` | non | oui | oui |
| `POST /api/leases/takeover` `{span}` | non | non | oui |
| `POST /api/exclusive`, `POST /api/exclusive/release` | non | non | oui |
| `POST /api/play-ticket` (une session de navigateur seulement, jamais un jeton Bearer) | oui | oui | oui |

<a name="matrix-comments"></a>

## Commentaires

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/comments`, `POST /api/comments` | oui | oui | oui |
| `PUT /api/comments/<id>` avec `text` | ses commentaires | ses commentaires | ses commentaires |
| `PUT /api/comments/<id>` avec `resolved` | ses fils | tous | tous |
| `POST /api/comments/import-notes` | non | non | oui |

Seul son auteur change le texte d'un commentaire, quel que soit son rôle (403 sinon). Aucune route ne supprime un
commentaire.

<a name="matrix-assets"></a>

## Assets, jobs et builds

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/assets`, `/api/assets/prompts`, `/api/assets/file/<chemin>`, `/api/assets/prepared` | oui | oui | oui |
| `POST /api/assets/sound`, `/decor` (uploads) | non | oui | oui |
| `POST /api/assets/sheet`, `/cell`, `/prepare` (jobs, sous votre bail exclusif) | non | oui | oui |
| `GET /api/jobs/<id>` | oui | oui | oui |
| `POST /api/jobs/<id>/cancel` | non | les jobs qu'il a lancés | tout job |
| `GET /api/builds`, `GET /api/builds/<n>` | oui | oui | oui |
| `POST /api/builds` (publier la tête) | non | oui | oui |
| `POST /api/builds/<n>/rebuild` (reconstruire à neuf) | non | non | oui |
| Les images et sons du jeu sur l'origine du Studio (`/assets/img/…`, `/assets/audio/…`, `/assets/video/…`) | oui | oui | oui |

<a name="matrix-owner"></a>

## Membres, Git et moteur

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/members` (les membres et les invitations en attente) | non | non | oui |
| `POST /api/invitations` `{email, role}` | non | non | oui |
| `PUT /api/members/<id>` `{role}` | non | non | oui |
| `DELETE /api/members/<id>` | non | non | oui |
| `DELETE /api/members/<id>/sessions` | non | non | oui |
| `GET /api/audit` | non | non | oui |
| `GET /api/git` | oui | oui | oui |
| `POST /api/git/push`, `POST /api/git/import` `{ref?}` | non | non | oui |
| `POST /api/engine/migrate` | non | non | oui |

Voir [Gérer les membres](team.members.md), [Le jeu dans Git](team.game-in-git.md) et
[Mettre à jour le moteur d'un jeu hébergé](team.upgrade-engine.md).

<a name="matrix-mcp"></a>

## Le MCP distant

`POST /mcp` n'accepte qu'un jeton d'accès Bearer (jamais le cookie de session), d'un membre : un reviewer au moins.
Chaque outil est ensuite une requête à la même `/api` avec le jeton de l'appelant, donc un outil demande le rôle de sa
route : l'agent d'un reviewer lit et vérifie, celui d'un dev écrit. Voir [MCP distant](team.remote-mcp.md).

<a name="public"></a>

## Les routes sans rôle

| Route | Qui |
|---|---|
| `GET /livez`, `/startz`, `/readyz` | n'importe qui (aucune donnée) |
| `GET /metrics` | le porteur de `STUDIO_METRICS_TOKEN` seulement, jamais une session ([Routes de santé et de métriques](team.health-metrics.md)) |
| `GET /.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` | n'importe qui |
| La page du Studio et ses fichiers statiques (`/`, `/assets/…` hors images, sons et vidéos, `/icons/…`, `/fonts/…`) | n'importe qui (ils ne contiennent aucune donnée) |
| `GET /auth/login`, `GET /auth/callback`, `POST /auth/backchannel`, `GET /auth/cli` | n'importe qui |
| `GET /auth/me`, `POST /auth/logout` | toute personne connectée, membre ou non (`/auth/me` répond `role: null` à un non-membre) |

Chaque route `/auth/…` accepte au plus 30 requêtes par minute et par adresse ; au-delà elle répond 429 avec
`Retry-After: 60`.

<a name="game-origin"></a>

## L'origine du jeu

Sur `playUrl`, aucune API du Studio ni route `/auth` ne répond. Chaque chemin demande une session de jeu, créée à
partir d'un ticket que la session de navigateur d'un membre a demandé (`POST /api/play-ticket`) : n'importe quel rôle.
La session de jeu dure 15 minutes, glissantes, et elle est vérifiée à chaque requête contre la session Studio et
l'appartenance du membre. Avec `publicBuilds: true` dans la configuration, `/play/…` et `/icons/…` (les builds
publiés) s'ouvrent sans session, à tout le monde.

<a name="refusals"></a>

## Les refus qui ne tiennent pas au rôle

Même avec le bon rôle, une écriture peut être refusée :

- **423** : le pan est tenu par quelqu'un d'autre, ou le jeu entier l'est ([423](team.write-refused-423.md)).
- **409** : le fichier a changé depuis votre lecture ([409](team.write-refused-409.md)), ou le dernier owner serait
  rétrogradé ou retiré.
- **403** `forbidden` : une écriture du navigateur sans l'`Origin` exacte, l'en-tête `X-Studio-Request: 1` et un corps
  JSON.
- **503** avec `Retry-After` : l'instance ne sert pas encore les écritures (un redéploiement), ou le fournisseur
  d'identité n'a pas confirmé votre session depuis 15 minutes (`suspended`).
- **429** : trop d'authentifications refusées depuis une même adresse en une minute (30), ou une file de jobs pleine.

> [!GUARANTEE id=roles-read-review-write-dev]
> Chaque route de la table de l'API du Studio demande un reviewer quand elle ne fait que lire (un `GET`, ou l'un des
> `POST` de lecture) et un dev sinon ; le test parcourt toute la table.

> [!LIMIT id=roles-fixed]
> Les trois rôles sont fixes : pas de rôle sur mesure, pas de droit par salle, pas de dev en lecture seule. Les groupes
> d'un fournisseur ne donnent aucun droit.

<a name="related"></a>

## Identifiants liés

- [Gérer les membres](team.members.md), [Invitations](team.invitations.md).
- [Concepts](team.concepts.md) : pans, baux, bail exclusif.
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) : les quatre politiques HTTP.
