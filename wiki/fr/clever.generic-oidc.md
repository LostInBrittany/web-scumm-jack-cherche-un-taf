# OIDC générique et GitLab

Tout fournisseur OpenID Connect doté de la découverte peut connecter les gens au Studio depuis un navigateur. La CLI et
le MCP distant lui en demandent davantage. Cette page dit ce qui marche avec un autre fournisseur que Keycloak, GitLab
compris, et ce qui ne marche pas.

<a name="what-you-get"></a>

## Ce que vous obtenez

Des connexions au Studio depuis le navigateur par votre fournisseur (GitLab, Authentik ou un autre), avec les mêmes
rôles et invitations qu’avec Keycloak. Avec un fournisseur qui émet des jetons d’accès JWT pour l’audience du Studio,
la CLI et le MCP distant aussi.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3 (D44 : GitLab pour la passe `studio-oidc-generic`).
- **Vérifié sur : non vérifié sur une installation réelle.** La passe `studio-oidc-generic` (connexion, rôles, un
  membre révoqué refusé, sur un vrai GitLab) est `not-run` pour la 4.4.0. Ce que dit cette page vient du code et du
  guide.

<a name="prerequisites"></a>

## Prérequis

- [Domaines et TLS](clever.domains-tls.md) faits : vous connaissez `publicUrl`.
- Un compte chez le fournisseur qui a le droit de créer une application OAuth / OpenID Connect.

<a name="where-to-run"></a>

## Où lancer les commandes

L’application se crée dans la console du fournisseur. `clever env set` : sur votre machine, dans le dépôt du moteur
où l’application studio est liée.

<a name="steps"></a>

## Étapes

<!-- step: create-client -->
1. Chez le fournisseur, créez l’application `studio` comme pour Keycloak : un client confidentiel, les scopes `openid
   profile email`, Authorization Code avec PKCE S256, l’URI de redirection `<publicUrl>/auth/callback`, la redirection
   après déconnexion `<publicUrl>`, et le back-channel logout vers `<publicUrl>/auth/backchannel` si le fournisseur le
   propose.

<!-- step: secret -->
2. Gardez son secret dans un fichier 0600 et posez-le sur l’application studio :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   ```

<!-- step: config -->
3. Écrivez le fournisseur dans le `oidc` de la configuration. Pour GitLab, l’émetteur est `https://gitlab.com` ;
   `clientId` est l’identifiant de l’application ; `audience` est un nom quelconque autre que `clientId` (le serveur
   refuse le même) :

   ```json
   { "issuer": "https://gitlab.com", "clientId": "<application id>", "audience": "studio-api" }
   ```

   Laissez `cliClientId` de côté quand le fournisseur ne peut pas servir la CLI (plus bas) : `GET /auth/cli` répond
   alors `client_id: null`.

> [!LIMIT id=cli-needs-jwt]
> La CLI et le MCP distant présentent les **jetons d’accès du fournisseur en JWT**, signés pour l’audience de ce
> Studio, valables 5 minutes (15 au plus). Un fournisseur aux jetons d’accès opaques (les applications OAuth de GitLab,
> au moment où ces lignes sont écrites) ne les donne pas : avec lui, la CLI et le MCP distant ne sont pas proposés, ou
> restent sur un fournisseur qui le fait (Keycloak, Authentik et d’autres).

> [!LIMIT id=no-backchannel]
> Sans back-channel logout, une session finie chez le fournisseur finit dans le Studio à sa vérification suivante
> (toutes les 5 min, par son jeton de rafraîchissement), et un utilisateur désactivé là-bas dans R = 15 min. Un
> fournisseur qui ne donne pas de jeton de rafraîchissement reçoit des sessions de 15 min au plus.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le Studio démarre (il lit la découverte de l’émetteur au démarrage) ; un membre invité se connecte depuis un navigateur
avec l’e-mail vérifié de l’invitation ; `GET /auth/me` donne son rôle. Une invitation n’est consommée que par l’e-mail
vérifié qu’elle nomme : un fournisseur qui ne dit pas l’e-mail vérifié ne peut pas faire accepter d’invitation.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le membre se connecte mais n’est « not a member of this project » | Le fournisseur ne donne pas `email_verified`, ou un autre e-mail | Vérifiez l’e-mail chez le fournisseur ; invitez cet e-mail-là |
| `the access token is not valid` depuis la CLI | Jetons d’accès opaques, ou sans audience | Non pris en charge avec ce fournisseur (limite plus haut) |
| `oidc.maxTokenSeconds is between 30 and 900` | Une valeur hors de l’intervalle | Mettez 300 à 900, ou rien (300) |
| `oidc.issuer must be an http(s) URL` | L’émetteur sans son schéma | L’URL complète |

<a name="files-changed"></a>

## Fichiers ou données modifiés

L’application chez le fournisseur ; `STUDIO_OIDC_CLIENT_SECRET` et `STUDIO_CONFIG_JSON` sur l’application studio.

<a name="recovery"></a>

## Reprise ou retour arrière

Passer d’un fournisseur à l’autre change l’identité de tout le monde :
[Changer de domaine ou de fournisseur OIDC](clever.change-domain.md).

<a name="oidc-fields"></a>

## Référence : les champs de `oidc`

| Champ | Requis | Valeur | Défaut |
|---|---|---|---|
| `issuer` | oui | l’émetteur du fournisseur, une URL http(s) (sa découverte est lue au démarrage) | — |
| `clientId` | oui | le client du navigateur (`studio`) | — |
| `audience` | oui | l’audience que doivent porter les jetons d’accès ; différente de `clientId` | — |
| `cliClientId` | non | le client public du device flow, donné à la CLI par `GET /auth/cli` | aucun |
| `scopes` | non | les scopes d’une connexion du navigateur | `openid email profile` |
| `maxTokenSeconds` | non | le jeton d’accès le plus long accepté, de 30 à 900 | 300 |
| `allowInsecure` | non | un fournisseur en http simple, pour un test local seulement ; jamais en production | false |

Avec `oidc`, le serveur exige aussi `worker`, `trustProxy` (quand il écoute au-delà de la boucle locale),
`STUDIO_OIDC_CLIENT_SECRET` et `STUDIO_SESSION_KEY` ([Configuration](clever.configuration.md)). Une clé inconnue au
premier niveau de la configuration est refusée au démarrage ; dans `oidc`, un champ inconnu est ignoré. Depuis la 4.2.1.

<a name="references"></a>

## Références

- [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts),
  [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) ; la mise en place de Keycloak :
  [Keycloak](clever.keycloak.md) ; la révocation : [Sécurité](clever.security.md#revocation).
