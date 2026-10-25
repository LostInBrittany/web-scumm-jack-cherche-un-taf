# Changer de domaine ou de fournisseur OIDC

Déplacer un Studio en service sur de nouveaux noms, ou vers un autre fournisseur OpenID Connect. Le jeu et son
histoire ne bougent pas ; ce qui change, c’est la façon dont on l’atteint et qui le Studio croit que sont les gens.

<a name="what-you-get"></a>

## Ce que vous obtenez

Le Studio servi sur ses nouveaux `publicUrl` et `playUrl` (ou connectant les gens par le nouveau fournisseur), chaque
membre de retour avec son rôle, et les anciens noms ou l’ancien fournisseur retirés.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3.
- **Vérifié sur : non vérifié sur une installation réelle.** Aucun des deux changements n’a été exercé ; ce qui suit
  est lu dans le code et le guide de déploiement.

<a name="prerequisites"></a>

## Prérequis

- Les nouveaux sous-domaines de votre domaine ([Domaines et TLS](clever.domains-tls.md)), ou le nouveau fournisseur
  prêt ([Keycloak](clever.keycloak.md), [OIDC générique](clever.generic-oidc.md)).
- Une sauvegarde faite juste avant ([Sauvegardes](clever.backups.md#steps), étape 3), et la liste des membres avec
  leurs rôles (`GET /api/members` en owner).

<a name="where-to-run"></a>

## Où lancer les commandes

`clever …` : sur votre machine, dans le dépôt du moteur où les applications sont liées. `invite` : dans un shell sur
l’application studio (`clever ssh --alias my-game-studio`). Les réglages du fournisseur : dans sa console
d’administration.

<a name="steps"></a>

## Étapes

<a name="domain"></a>

### Changer de domaine

<!-- step: add-new-names -->
1. Ajoutez les nouveaux noms à côté des anciens : `studio.` et `play.` à l’application studio, celui du worker au
   worker ([Domaines et TLS](clever.domains-tls.md#steps)).

<!-- step: provider-uris -->
2. Chez le fournisseur, **ajoutez** les nouvelles URI au client `studio`, en gardant les anciennes pour l’instant :
   l’URI de redirection `<nouveau publicUrl>/auth/callback`, la redirection après déconnexion `<nouveau publicUrl>`,
   et mettez l’URL de déconnexion back-channel à `<nouveau publicUrl>/auth/backchannel`.

<!-- step: config-domain -->
3. Changez `publicUrl`, `playUrl` (et `worker.url` si le worker déménage) dans la configuration, posez-la, et
   redéployez le studio ([Configuration](clever.configuration.md#steps), étape 5). Le serveur n’accepte les mutations
   qu’avec une `Origin` égale au nouveau `publicUrl` : l’ancien nom cesse aussitôt de marcher pour les écritures.

<!-- step: tell-members -->
4. Prévenez les membres :
   - **Tout le monde se reconnecte** sur le nouveau nom : le cookie de session (`__Host-ws_session`) appartient à
     l’hôte qui l’a posé, et celui de l’ancien nom n’est jamais envoyé au nouveau.
   - La CLI garde ses jetons par serveur : `npm run studio-server -- login --server https://<nouveau nom du studio>` ;
     un client MCP configuré sur l’ancienne URL est repointé sur la nouvelle.
   - Un lien d’invitation affiché avant marche toujours en remplaçant son hôte par le nouveau nom : le jeton est le
     même.
   - Les URL des builds publiés (`/play/<n>/` sur l’origine du jeu) changent avec `playUrl`.

<!-- step: retire-old -->
5. Une fois tout le monde sur le nouveau nom, retirez les anciennes URI chez le fournisseur et les anciens noms des
   applications (`clever domain rm <ancien nom> --alias my-game-studio`).

<a name="provider"></a>

### Changer de fournisseur OIDC

Le Studio connaît une personne par le `(iss, sub)` du fournisseur. Un nouveau fournisseur donne à chacun une nouvelle
identité : pour le Studio, ce sont de nouveaux utilisateurs, membres de rien. Les rôles doivent être redonnés, par
invitation.

<!-- step: switch-provider -->
6. Posez le secret client du nouveau fournisseur et le `oidc` de la configuration (`issuer`, `clientId`, `audience`,
   `cliClientId`), et redéployez le studio. Il lit la découverte du nouvel émetteur au démarrage. Chaque session prend
   fin à sa vérification suivante (les jetons de rafraîchissement de l’ancien fournisseur ne disent rien au nouveau),
   et les jetons Bearer de l’ancien fournisseur sont refusés.

<!-- step: reinvite -->
7. Réinvitez chaque membre, avec son rôle, du côté de l’opérateur ; chacun se connecte par le nouveau fournisseur avec
   le même e-mail vérifié :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run studio-server -- invite --email lea@example.fr --role dev
   ```

<!-- step: remove-old-members -->
8. En owner sur le nouveau fournisseur, retirez les anciennes identités de la liste des membres : elles y figurent
   encore (et le dernier owner parmi elles ne peut être retiré qu’une fois un nouvel owner créé, étape 7).

> [!LIMIT id=history-keeps-old-names]
> L’histoire du jeu, les commentaires et le journal d’audit gardent les auteurs tels qu’ils ont été écrits, sous les
> anciennes identités. Rien ne fusionne une ancienne identité dans une nouvelle.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Domaine : `https://<nouveau nom du studio>/readyz` répond 200, un membre s’y connecte et écrit, le jeu s’affiche dans
  la vue de la pièce (le cadre du jeu sur le nouveau `playUrl`).
- Fournisseur : `GET /api/members` liste chaque membre avec une nouvelle identité et son rôle ; `GET /auth/cli` nomme
  le nouvel émetteur.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le fournisseur refuse la redirection | La nouvelle URI de retour pas ajoutée au client `studio` | Étape 2 |
| `forbidden` (403) à chaque enregistrement | Un onglet encore ouvert sur l’ancien nom | Rechargez sur le nouveau nom |
| « not a member of this project » après le changement de fournisseur | Pas encore réinvité | Étape 7 |
| Les cadres du jeu restent vides | `playUrl` pas sur le même domaine que `publicUrl` | Deux sous-domaines d’un même domaine |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`STUDIO_CONFIG_JSON` (et le secret client pour un changement de fournisseur) ; les domaines des applications ; le
client chez le fournisseur ; de nouvelles lignes d’utilisateurs et de membres, des invitations et des entrées d’audit.
Les fichiers du jeu et son histoire ne changent pas.

<a name="recovery"></a>

## Reprise ou retour arrière

- Domaine : reposez les anciennes URL et redéployez, tant que les anciens noms et les anciennes URI sont gardés
  (étape 5 pas encore faite).
- Fournisseur : reposez l’ancien fournisseur et redéployez ; les anciennes identités sont encore membres, sauf si
  l’étape 8 les a retirées.

<a name="references"></a>

## Références

- [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts) (`publicUrl`, `playUrl`),
  [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (identités, invitations),
  [`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts) (cookies, retour de
  connexion).
- [Sécurité](clever.security.md), [Récupérer l’accès administrateur](clever.admin-recovery.md).
