# Gérer les membres

Un owner d'un Studio d'équipe liste les membres, change un rôle, retire quelqu'un, met fin aux sessions de quelqu'un,
et lit le journal d'audit. Cette page donne chaque action dans le Studio et par l'API, les routes telles que le code
les définit, et ce qui n'est pas possible.

<a name="what-you-get"></a>

## Ce que vous obtenez

L'équipe que vous voulez, avec les droits que vous voulez : qui est membre, avec quel rôle, et une trace de qui a fait
quoi.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server) avec un fournisseur OpenID Connect, depuis la 4.2.1. Toutes les actions de cette
page reviennent à un owner. Les routes sont dans
[`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts) et
[`auth/store.ts`](../../studio-server/src/server/auth/store.ts) ; le panneau est
[`src/studio/members.ts`](../../src/studio/members.ts).

<a name="prerequisites"></a>

## Prérequis

- Le rôle `owner` (voir [Rôles et actions](team.roles.md)).
- Pour l'API : un jeton d'accès d'owner (`npm run studio-server -- token --server <url>`, voir
  [La ligne de commande du serveur](team.server-cli.md#token)).

<a name="where-to-run"></a>

## Où lancer les commandes

- Dans le Studio : votre nom dans l'en-tête, puis **Members…**. Le panneau montre les membres (personne, rôle,
  sessions actives, présent ou non), le formulaire **Invite**, les invitations pas encore utilisées, et les 30
  dernières lignes du journal d'audit.
- Par l'API : depuis n'importe quelle machine, avec le jeton d'un owner, sur l'URL publique du Studio.
- Il n'y a **aucune sous-commande en ligne de commande** pour ces actions : la CLI du serveur n'a que `invite` (voir
  [Invitations](team.invitations.md)).

<a name="steps"></a>

## Étapes

<!-- step: list -->
1. **Lister les membres.** Ouvrez **Members…**, ou appelez `GET /api/members` (voir [plus bas](#list)).

<!-- step: change-role -->
2. **Changer un rôle.** Dans la ligne du membre, choisissez le nouveau rôle dans la liste et confirmez (« Make Léa
   reviewer? »). Ou `PUT /api/members/<id>` avec `{"role": "reviewer"}` (voir [plus bas](#change-role)).

<!-- step: end-sessions -->
3. **Déconnecter quelqu'un partout.** Cliquez sur **End sessions** et confirmez. La personne reste membre et peut se
   reconnecter. Ou `DELETE /api/members/<id>/sessions` (voir [plus bas](#end-sessions)).

<!-- step: remove -->
4. **Retirer un membre.** Cliquez sur **Remove** et confirmez (« Their access ends at their next request. »). Ou
   `DELETE /api/members/<id>` (voir [plus bas](#remove)). Pour revenir, il lui faut une nouvelle invitation.

<!-- step: read-audit -->
5. **Lire le journal d'audit**, en bas du panneau, ou `GET /api/audit` (voir [plus bas](#audit-log)).

<a name="list"></a>

## `GET /api/members`

### Forme

```sh
# n'importe où, avec le jeton d'un owner
curl -H "Authorization: Bearer $TOKEN" https://studio.example.fr/api/members
```

### Valeurs

```json
{
  "members": [{ "id": "…", "email": "lea@example.org", "name": "Léa", "role": "dev", "sessions": 1 }],
  "invitations": [{ "email": "sam@example.org", "role": "reviewer", "expiresAt": 1761300000000 }]
}
```

- `members` : chaque membre, trié par email ; `id` est l'identifiant d'utilisateur du Studio (celui que prennent les
  autres routes) ; `sessions` compte les sessions de navigateur pas encore expirées (un jeton Bearer n'est pas une
  session).
- `invitations` : celles qui n'ont pas servi et n'ont pas expiré ; `expiresAt` en millisecondes depuis 1970.

<a name="change-role"></a>

## `PUT /api/members/<id>`

### Forme

`PUT /api/members/<id>` avec le corps JSON `{"role": "owner" | "dev" | "reviewer"}`. Répond `{"ok": true}`.

### Effets

- Le nouveau rôle s'applique à la requête suivante de la personne.
- Il compte comme une révocation : ses flux en direct se ferment (en 5 s) et se rouvrent avec le nouveau rôle, sa page
  redémarre, et **tous les baux qu'elle tenait sont rendus aussitôt**.
- Le journal d'audit note `member-role` avec la cible et le nouveau rôle.

### Contraintes

- **Le dernier owner reste owner** : rétrograder le seul owner est refusé par **409** `the last owner stays an owner`.
  Pour passer la main, faites d'abord de l'autre personne un owner, puis rétrogradez-vous.
- Un owner peut se rétrograder lui-même s'il reste un autre owner (le Studio prévient « This is you. »).
- Un autre nom de rôle : **400** `` `role` is owner, dev or reviewer ``. Un identifiant inconnu : **404**
  `no such member`.

<a name="end-sessions"></a>

## `DELETE /api/members/<id>/sessions`

Met fin à toutes les sessions de navigateur du membre et refuse tous les jetons d'accès émis avant maintenant. Ses flux
en direct se ferment en 5 s et ses baux sont rendus. La personne reste membre : elle peut se reconnecter aussitôt, et
la CLI peut obtenir un nouveau jeton grâce à son jeton de rafraîchissement. À utiliser après un portable perdu, avec un
changement de mot de passe chez le fournisseur. Le journal d'audit note `sessions-revoked`.

<a name="remove"></a>

## `DELETE /api/members/<id>`

### Effets

- L'appartenance est supprimée, toutes les sessions de la personne prennent fin, et tous les jetons d'accès émis avant
  maintenant sont refusés.
- Son accès s'arrête à sa **requête suivante**, par le navigateur, la CLI ou le MCP ; ses flux en direct se ferment en
  5 s ; ses baux et sa présence disparaissent aussitôt, pour que personne n'attende un pan qu'elle ne peut plus rendre.
- Ses opérations passées restent dans le journal à son nom, et ses commentaires restent.
- Le journal d'audit note `member-removed`.

### Contraintes

- **Le dernier owner ne peut pas être retiré** (409 `the last owner stays an owner`).
- Pour revenir, la personne a besoin d'une nouvelle invitation.

> [!GUARANTEE id=owner-last-owner-and-removal]
> Le dernier owner ne peut pas être rétrogradé (409), et un membre retiré perd l'accès à sa requête suivante, session
> comme jetons d'accès plus anciens.

Le dernier owner ne peut pas non plus être retiré : la même vérification répond 409.

<a name="provider-side"></a>

## Les comptes désactivés chez le fournisseur

Le Studio vérifie chaque session de navigateur auprès du fournisseur toutes les 5 minutes. Quand le fournisseur
désactive un compte, ses sessions prennent fin à la vérification suivante, en 15 minutes au plus (R). Une déconnexion
back-channel du fournisseur met fin aux sessions qu'elle nomme aussitôt. Si le fournisseur reste injoignable plus de
15 minutes, les sessions sont suspendues (503) jusqu'à ce qu'il réponde de nouveau. Retirer quelqu'un dans le Studio
est immédiat ; le désactiver chez le fournisseur l'arrête sur tous les services à la fois. Voir
[ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md).

<a name="audit-log"></a>

## `GET /api/audit`

### Forme

```sh
# n'importe où, avec le jeton d'un owner
curl -H "Authorization: Bearer $TOKEN" https://studio.example.fr/api/audit
```

### Valeurs

`{"entries": [{"at", "actor", "event", "detail"}]}`, les **200 entrées les plus récentes**, de la plus récente à la
plus ancienne. `at` est en millisecondes depuis 1970 ; `actor` est l'identifiant d'utilisateur Studio de qui a agi,
`null` quand personne n'a agi (le fournisseur, un retour de connexion refusé), ou `studio-server invite` pour une
invitation faite en ligne de commande.

| `event` | Quand | `detail` |
|---|---|---|
| `login` | quelqu'un s'est connecté par le navigateur, membre ou non | `{}` |
| `logout` | quelqu'un s'est déconnecté | `{}` |
| `login-failed` | la réponse du fournisseur a été refusée au retour de connexion | `{reason}` |
| `backchannel-logout` | le fournisseur a mis fin à des sessions | `{sid, sub, users}` |
| `invited` | une invitation a été créée | `{email, role}` |
| `invitation-accepted` | quelqu'un est entré | `{role}` |
| `invitation-refused` | une invitation n'a pas pu servir | `{reason}` |
| `member-role` | un rôle a changé | `{userId, role}` |
| `member-removed` | un membre a été retiré | `{userId, role: null}` |
| `sessions-revoked` | un owner a mis fin aux sessions de quelqu'un | `{userId}` |
| `lease-takeover` | un owner a repris un pan | `{span, previous}` |

Le panneau Members montre les 30 dernières, en phrases (« Léa removed Tom »).

> [!LIMIT id=audit-no-paging]
> L'API ne donne que les 200 dernières entrées, sans filtre, sans pagination et sans export. Le serveur ne supprime
> jamais de ligne d'audit : elles restent dans la table `studio_audit` et dans chaque sauvegarde. Pour en lire plus,
> interrogez la base en lecture seule, par exemple `SELECT at, actor, event, detail FROM studio_audit ORDER BY at DESC`
> avec `psql` sur l'URI de la base. Les écritures du jeu ne sont pas dans l'audit : elles sont dans le journal, par
> auteur (`GET /api/ops`).

<a name="not-possible"></a>

## Ce qui n'est pas possible

- **Aucune sous-commande en ligne de commande** ne liste, ne rétrograde ni ne retire de membre, ni ne lit l'audit :
  seulement l'API ou le Studio.
- **Aucune invitation en attente ne peut être retirée** ([Invitations](team.invitations.md#rules)).
- **Pas de passation en une étape** : promouvoir, puis rétrograder.
- **Pas d'ajout de membre sans qu'il se connecte** : l'appartenance vient toujours d'une invitation acceptée avec un
  email vérifié.
- **Pas de suspension qui garde l'appartenance** : « End sessions » déconnecte, mais la personne peut se reconnecter ;
  pour l'arrêter, retirez-la, ou désactivez-la chez le fournisseur.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le panneau Members montre le changement, et sa ligne apparaît dans le journal d'audit. Une personne retirée qui
réessaie reçoit une 401 (sa session n'existe plus), puis « Access not granted » après s'être reconnectée.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| 409 `the last owner stays an owner` | Vous rétrogradez ou retirez le seul owner | Faites d'abord quelqu'un d'autre owner |
| 404 `no such member` | L'identifiant n'est pas un membre (déjà retiré ?) | `GET /api/members` pour les identifiants |
| 403 `this needs the role owner` | Votre rôle n'est pas owner | Demandez à un owner |
| 401 sur `/api/members` avec un jeton | Le jeton a expiré ou a été révoqué | Prenez-en un nouveau : `npm run studio-server -- token --server <url>` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Des lignes de `studio_members`, `studio_sessions` et `studio_users` (`revoked_before`) dans la base, et une ligne
d'audit par action. Aucun fichier du jeu.

<a name="recovery"></a>

## Revenir en arrière

Un rôle changé par erreur se rechange. Un retrait ne s'annule pas : invitez de nouveau la personne. Perdre tous les
owners n'est pas possible par ces routes ; si le compte de l'owner est perdu chez le fournisseur, voir
[Retrouver l'accès administrateur](clever.admin-recovery.md).

<a name="references"></a>

## Références

- [Rôles et actions](team.roles.md), [Invitations](team.invitations.md).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) : l'identité, la révocation en R = 15 min.
