# Récupérer l’accès administrateur

Que faire quand plus personne ne peut agir en owner du Studio, ou quand l’administration du fournisseur elle-même est
perdue. Le Studio ne laisse jamais de lui-même un projet sans owner ; la perte d’accès vient d’ailleurs (un compte
perdu chez le fournisseur, une personne partie).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un owner qui peut de nouveau se connecter, créé du côté de l’opérateur par `clever ssh`, et l’ancien owner rétrogradé
ou retiré s’il le faut ; ou, pour Keycloak, son administration retrouvée.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3. Vous avez accès à l’organisation Clever Cloud (c’est le
  chemin de reprise de l’opérateur : qui peut faire `clever ssh` sur l’application studio peut créer un owner).
- **Vérifié sur : non vérifié sur une installation réelle.** La commande d’invitation elle-même a tourné sur le
  déploiement de référence (19 octobre 2026) pour créer le premier owner ; cette reprise n’a pas été exercée.

> [!GUARANTEE id=last-owner-stays]
> Le dernier owner ne peut pas être rétrogradé (409), pas même en acceptant une invitation d’un rôle inférieur pour
> son propre e-mail.

Retirer le dernier owner passe par la même vérification dans le code (409 « the last owner stays an owner ») : un
projet garde donc un owner du côté du Studio.

<a name="prerequisites"></a>

## Prérequis

- `clever-tools` connecté à l’organisation qui porte les applications.
- Une adresse e-mail que le fournisseur dit **vérifiée**, pour la personne qui deviendra owner, et un compte chez le
  fournisseur avec elle.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans un shell sur l’application studio : `clever ssh --alias my-game-studio`, depuis votre machine, dans le dépôt du
moteur où l’application est liée. Ce shell a la configuration et les identifiants de la base : la commande n’a pas
besoin de `--config`.

<a name="steps"></a>

## Étapes

<!-- step: ask-owner -->
1. Si un autre owner peut encore se connecter, demandez-lui : il change les rôles dans l’écran des membres du Studio
   ([Gérer les membres](team.members.md)). Arrêtez-vous là.

<!-- step: provider-account -->
2. Si le problème est le compte de l’owner chez le fournisseur (mot de passe perdu, compte désactivé), réglez-le
   d’abord là-bas : dans la console d’administration de Keycloak, réinitialisez le mot de passe de l’utilisateur ou
   réactivez-le. Son identité dans le Studio est le `(iss, sub)` du fournisseur : le même compte retrouve le même rôle.
   Arrêtez-vous là si cela suffit.

<!-- step: invite-owner -->
3. Sinon, créez un nouvel owner du côté de l’opérateur :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run studio-server -- invite --email new-owner@example.fr --role owner
   ```

   Elle affiche un lien à usage unique, valable 7 jours, et note `invited` dans le journal d’audit avec
   `studio-server invite` pour auteur. La personne l’ouvre et se connecte avec cet e-mail vérifié : elle devient owner
   (le rôle d’un membre existant est remplacé).

<!-- step: tidy -->
4. Connecté comme le nouvel owner, rétrogradez ou retirez le compte perdu dans l’écran des membres, maintenant qu’il
   n’est plus le dernier owner. Un retrait termine ses sessions et refuse ses jetons à la requête suivante.

<a name="keycloak-admin"></a>

### L’administrateur de Keycloak est perdu

Le premier mot de passe administrateur du Keycloak managé est temporaire ; une fois changé, la console de Clever et
`CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD` continuent d’afficher l’ancien ([Keycloak](clever.keycloak.md#steps), étape 2). Si
le nouveau est perdu :

- ce projet ne documente aucune façon de le réinitialiser, et n’en a essayé aucune ; demandez d’abord au support de
  Clever Cloud ;
- le repli, c’est un nouvel add-on Keycloak avec le realm recréé : chaque membre y reçoit une nouvelle identité (un
  nouveau `sub`) et doit être réinvité. C’est [Changer de domaine ou de fournisseur OIDC](clever.change-domain.md).

> [!LIMIT id=operator-is-root]
> Qui peut faire `clever ssh` sur l’application studio, ou détient une sauvegarde, peut créer un owner. Restreignez en
> conséquence les membres de l’organisation Clever Cloud : les rôles du Studio ne protègent pas contre les opérateurs
> de la plateforme.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le `GET /auth/me` du nouvel owner dit `role: owner` ; `GET /api/members` le liste comme owner ; `GET /api/audit` montre
`invited` puis `invitation-accepted`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Connecté, mais « not a member of this project » | L’e-mail n’est pas vérifié chez le fournisseur, ou un autre a été invité | Vérifiez l’e-mail chez le fournisseur ; invitez exactement celui-là |
| « this login has expired or was already used: start again » | La page de connexion laissée plus de 10 min, ou rechargée | Rouvrez le lien d’invitation |
| Le lien d’invitation ne fait rien après 7 jours | Il a expiré | Refaites l’étape 3 |
| `usage: studio-server invite --email <email> --role …` | Un drapeau manquant ou mal écrit, ou un rôle autre que owner, dev ou reviewer | `--email` et `--role` tous deux |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Une ligne d’invitation (stockée par son hash), puis une ligne de membre ; des entrées d’audit. Rien d’autre.

<a name="recovery"></a>

## Reprise ou retour arrière

Une invitation non utilisée expire en 7 jours. Un mauvais owner est rétrogradé ou retiré par un autre owner.

<a name="references"></a>

## Références

- [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (les invitations, le dernier
  owner), [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts) (`invite`).
- Le test derrière la garantie : [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
- [Invitations](team.invitations.md), [Gérer les membres](team.members.md), [Rôles](team.roles.md).
