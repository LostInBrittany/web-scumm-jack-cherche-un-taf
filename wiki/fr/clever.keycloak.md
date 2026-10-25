# Keycloak

Le Studio Server connecte les gens par un fournisseur OpenID Connect. Cette page prépare le Keycloak managé de Clever
Cloud pour lui, à partir du realm de test que porte le dépôt. Le fournisseur dit qui est quelqu’un ; ce qu’il peut
faire se décide dans le Studio.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un realm `web-scumm` sur un Keycloak managé, avec les deux clients dont le Studio a besoin (`studio` pour le
navigateur, `web-scumm-cli` pour la CLI et le MCP), un mapper d’audience, des jetons d’accès de 5 minutes, et vos
propres utilisateurs à l’e-mail vérifié. Son émetteur, `https://<hôte keycloak>/realms/web-scumm`, va dans la
configuration.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3.
- **Vérifié sur : 19 octobre 2026, par le déploiement de référence** (Keycloak managé, plan BASE, Keycloak 26.7.4,
  moteur au commit 52e68932, package.json 4.2.2 avant le tag 4.2.3) : le realm a été créé depuis le `realm.json`
  modifié par `POST /admin/realms` (201), et l’utilisateur de test du mainteneur s’est connecté en owner. Le chemin par
  la console (étape 4, première voie) et le texte exact de cette page ne sont pas vérifiés sur une installation réelle.

<a name="prerequisites"></a>

## Prérequis

- [Domaines et TLS](clever.domains-tls.md) : vous connaissez `publicUrl` (`https://studio.exemple.fr`).
- `clever-tools` connecté, et `openssl` sur votre machine.
- Le dépôt du moteur, pour [`ops/studio/keycloak/realm.json`](../../ops/studio/keycloak/realm.json).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine : `clever …` dans le dépôt du moteur ; le fichier du realm dans un dossier tenu hors de Git
(`~/secrets/my-game/`). Le realm lui-même se crée dans la console d’administration de Keycloak, dans un navigateur.

<a name="steps"></a>

## Étapes

<!-- step: create-keycloak -->
1. Créez un add-on Keycloak managé dans la même organisation (la console de Clever, ou `clever addon create` avec le
   fournisseur Keycloak ; `clever addon providers` donne son nom). Lisez ensuite l’adresse de sa console
   d’administration et ses premiers identifiants :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever keycloak get <keycloak-addon-id>
   ```

<!-- step: admin-password -->
2. Connectez-vous une fois à la console d’administration. Ce premier mot de passe est temporaire : Keycloak en demande
   un nouveau. La console de Clever et la variable de l’add-on `CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD` continuent
   d’afficher l’ancien ensuite : gardez le nouveau là où vous gardez les secrets. Sans lui, vous perdez
   l’administration du fournisseur ([Récupérer l’accès administrateur](clever.admin-recovery.md#keycloak-admin)).

<!-- step: edit-realm -->
3. Copiez `ops/studio/keycloak/realm.json` hors du dépôt et changez, dans la copie :
   - `clients[studio].redirectUris` en `["<publicUrl>/auth/callback"]` ;
   - `clients[studio].attributes` : `backchannel.logout.url` en `<publicUrl>/auth/backchannel`, et
     `post.logout.redirect.uris` en `<publicUrl>` ;
   - `clients[studio].secret` en une nouvelle valeur aléatoire, celle que vous poserez dans
     `STUDIO_OIDC_CLIENT_SECRET` ;
   - `users` : les vôtres, ou aucun (la console de Keycloak les ajoute), chacun avec un e-mail vérifié et un mot de
     passe qui n’est pas celui du fichier. Le `lea@example.org` / `lea-local-only` du fichier ne sert qu’à un test local.

   ```sh
   # sur votre machine
   mkdir -p ~/secrets/my-game && cp ops/studio/keycloak/realm.json ~/secrets/my-game/realm.json
   chmod 600 ~/secrets/my-game/realm.json
   openssl rand -base64 32 > ~/secrets/my-game/oidc-client-secret && chmod 600 ~/secrets/my-game/oidc-client-secret
   ```

   Gardez le fichier modifié, avec son secret et ses mots de passe, hors de Git.

<!-- step: import-realm -->
4. Créez le realm depuis le fichier modifié. L’API d’administration ne prend pas le mot de passe administrateur par le
   client `admin-cli` du realm master (`401 invalid_client`) : `kcadm.sh` et les scripts bâtis dessus échouent tels
   quels. Deux chemins marchent :
   - dans la console d’administration (`clever keycloak open webui <keycloak-addon-id>`), **Create realm**, avec le
     `realm.json` modifié ;
   - ou, avec un jeton d’administration obtenu par une connexion via le client de la console
     (`security-admin-console`, Authorization Code avec PKCE), `POST /admin/realms` avec le fichier modifié : ce qu’a
     fait le déploiement de référence.

<!-- step: cli-offline -->
5. Pour les membres qui se connectent depuis la CLI ou le MCP : le client `web-scumm-cli` a besoin du client scope
   `offline_access` (optionnel ou par défaut), et chacun de ces membres du rôle de realm `offline_access`. Sans eux, la
   connexion dit `the login was refused: not_allowed (Offline tokens not allowed for the user or client)`.

<!-- step: set-secret -->
6. Donnez à l’application studio le secret du client depuis son fichier, pour que la valeur ne soit jamais tapée ni
   affichée :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   ```

<!-- step: oidc-config -->
7. Mettez le fournisseur dans le `oidc` de la configuration ([Configuration](clever.configuration.md)) :

   ```json
   { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" }
   ```

<a name="what-the-studio-needs"></a>

### Ce que le Studio demande à tout fournisseur

- **Le client `studio`** : confidentiel, Authorization Code avec PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  redirection après déconnexion `<publicUrl>`, back-channel logout vers `<publicUrl>/auth/backchannel` avec
  l’identifiant de session.
- **Le client `web-scumm-cli`** : public, avec le device authorization grant et le client scope `offline_access`.
- **Un mapper d’audience** qui ajoute `studio-api` (l’`oidc.audience` de la configuration) aux jetons d’accès de
  `web-scumm-cli`. Elle doit différer de l’identifiant du client `studio` : un id_token n’est jamais accepté comme
  jeton d’accès.
- **Des jetons d’accès de 5 minutes.** Jusqu’à 15 si la configuration le dit (`oidc.maxTokenSeconds`, 900 au plus) :
  un jeton plus long est refusé.

Le realm de test règle tout cela (`accessTokenLifespan: 300`, PKCE S256, back-channel logout avec session requise, le
mapper `studio-api audience`).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `https://<hôte keycloak>/realms/web-scumm/.well-known/openid-configuration` répond, avec
  `backchannel_logout_supported: true` et un `device_authorization_endpoint` (tous deux mesurés sur le Keycloak managé
  par le spike S, §8).
- Une fois le Studio déployé, il démarre : il lit la découverte de l’émetteur au démarrage, et ne démarre pas tant que
  le realm manque. Un membre invité se connecte, et `GET /auth/me` donne son rôle.
- Depuis la CLI, `npm run studio-server -- login --server https://studio.example.fr` finit par `logged in`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `401 invalid_client` de l’API d’administration | Le mot de passe administrateur par `admin-cli` | Créez le realm dans la console, ou avec un jeton `security-admin-console` (étape 4) |
| `the login was refused: not_allowed (Offline tokens not allowed for the user or client)` | Pas de scope `offline_access` sur `web-scumm-cli`, ou pas de rôle pour l’utilisateur | Étape 5 |
| Le Studio ne démarre pas, les journaux nomment l’émetteur | Le realm manque, ou `oidc.issuer` est faux | Créez le realm ; vérifiez l’URL de découverte de l’émetteur |
| `oidc.audience must differ from oidc.clientId` | L’audience mise à `studio` | Prenez `studio-api` |
| Une connexion tourne en rond ou le fournisseur refuse la redirection | `redirectUris` encore celui du realm de test, `http://localhost:8080/...` | Étape 3 |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- Le realm dans Keycloak (clients, utilisateurs, rôles).
- `~/secrets/my-game/realm.json` et `oidc-client-secret` sur votre machine (mode 0600, hors de Git).
- `STUDIO_OIDC_CLIENT_SECRET` sur l’application studio.

<a name="recovery"></a>

## Reprise ou retour arrière

Supprimez le realm dans la console d’administration et recréez-le. Les utilisateurs du realm supprimé ont de nouvelles
identités dans le nouveau (un nouveau `sub`) : le Studio voit de nouveaux utilisateurs, qui ont besoin de nouvelles
invitations ([Changer de domaine ou de fournisseur OIDC](clever.change-domain.md)).

<a name="references"></a>

## Références

- Le realm de test : [`ops/studio/keycloak/realm.json`](../../ops/studio/keycloak/realm.json) ; les vérifications du
  fournisseur : [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) ;
  [`STUDIO_OIDC_CLIENT_SECRET`](reference.environment-variables.md#studio-oidc-client-secret).
- Un autre fournisseur : [OIDC générique et GitLab](clever.generic-oidc.md).
