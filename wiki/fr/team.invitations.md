# Invitations

Personne n'est membre d'un Studio d'équipe par défaut : c'est une invitation qui en fait un. Cette page dit comment un
owner invite quelqu'un, comment le premier owner entre, et ce qu'une invitation peut et ne peut pas faire.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un lien à usage unique pour une adresse email et un rôle. Quand cette personne l'ouvre et se connecte avec cet email,
vérifié par le fournisseur d'identité, elle devient membre avec ce rôle.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server) avec un fournisseur OpenID Connect, depuis la 4.2.1. Le Studio local n'a ni
membres ni invitations.

<a name="prerequisites"></a>

## Prérequis

- Un owner, pour inviter depuis le Studio ou l'API ; ou un shell sur la machine du serveur, pour le premier owner.
- La personne a un compte chez le fournisseur, avec une adresse email **vérifiée** : l'invitation compare l'email que
  le fournisseur dit vérifié, jamais une adresse tapée à la main.

<a name="where-to-run"></a>

## Où lancer les commandes

- Dans le Studio : votre nom dans l'en-tête, puis **Members…** (owners seulement).
- Par l'API : depuis n'importe quelle machine, avec le jeton d'un owner.
- Le premier owner : sur la machine de l'application `studio`, là où est la configuration du serveur (sur Clever
  Cloud, dans `clever ssh`), dans le dossier du dépôt du moteur.

<a name="steps"></a>

## Étapes

<!-- step: first-owner -->
1. **Le premier owner** passe par la ligne de commande, puisque personne ne peut encore inviter :

   ```sh
   # sur la machine de l'app studio, dans le dépôt du moteur (sur Clever Cloud : clever ssh, puis cd "$APP_HOME")
   npm run studio-server -- invite --email you@example.fr --role owner
   ```

   Elle affiche le lien. La configuration vient de `--config <fichier>` ou de `STUDIO_CONFIG_JSON`, que le shell de
   `clever ssh` a déjà. Depuis l'archive de la release, la commande est
   `npx quest-n-click-studio-server invite --email you@example.fr --role owner --config studio.config.json`.

<!-- step: invite-in-studio -->
2. **Tout autre membre**, dans le Studio : **Members…**, puis le formulaire **Invite**. Tapez l'email (vérifié chez le
   fournisseur), choisissez le rôle (`owner`, `dev` ou `reviewer` ; `dev` est présélectionné), et cliquez sur
   **Create the invitation link**. Le lien apparaît avec un bouton **Copy**.

   Par l'API, en owner :

   ```sh
   # n'importe où, avec le jeton d'un owner
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
     -d '{"email": "lea@example.org", "role": "dev"}' https://studio.example.fr/api/invitations
   ```

   La réponse est `{"link": "https://studio.example.fr/auth/login?invite=…", "expiresInDays": 7}`.

<!-- step: send-link -->
3. **Envoyez le lien vous-même** (le Studio n'envoie aucun email) : par messagerie, par mail. Il n'est montré qu'une
   fois ; seule son empreinte est gardée.

<!-- step: accept -->
4. **La personne ouvre le lien** et se connecte chez le fournisseur avec cet email. Au retour, elle est membre avec le
   rôle prévu. Voir [Débuter comme dev invité](team.first-day.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Dans **Members…**, la personne apparaît avec son rôle ; l'invitation quitte « Invitations not used yet ».
- Le journal d'audit montre `invited` (qui a invité qui, avec quel rôle), puis `joined as <rôle>`
  (`invitation-accepted`).
- En son nom, `GET /auth/me` répond son rôle.

<a name="rules"></a>

## Les règles de l'invitation

- **7 jours**, puis elle ne fonctionne plus.
- **Un seul usage.** Une seconde utilisation, par qui que ce soit, ne fait rien.
- **Pour un seul email vérifié.** L'email donné par le fournisseur doit être celui de l'invitation (comparé sans tenir
  compte de la casse), et le fournisseur doit le dire vérifié.
- **Elle donne le rôle qu'elle nomme.** Accepter une invitation remplace le rôle qu'avait la personne, sauf que le
  dernier owner ne peut pas perdre son rôle d'owner de cette façon.
- Une invitation refusée n'empêche pas la connexion : la personne est connectée mais pas membre, et voit la page
  « Access not granted », « Ask an owner of the project for an invitation. ». Le journal d'audit note
  `invitation-refused` avec la raison (`the invitation is not valid`, `the invitation is for another verified email`,
  ou `the last owner stays an owner`).

> [!GUARANTEE id=invitation-once-verified-email]
> Une invitation ne sert qu'une fois, et seulement à une personne dont l'email vérifié est celui qu'elle nomme.

> [!LIMIT id=invitation-no-revoke]
> Une invitation en attente ne peut pas être retirée : aucune route, ni dans le Studio ni dans l'API, ne l'annule. Elle
> expire au bout de 7 jours. Si un lien a fuité, attendez son expiration, ou retirez la personne une fois entrée (voir
> [Gérer les membres](team.members.md#remove)). Aucune commande ne liste non plus les invitations, en dehors de
> `GET /api/members` (ses `invitations` : email, rôle, expiration) et du panneau Members.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| La personne se connecte et voit « Access not granted » | L'invitation a expiré, a déjà servi, ou son email vérifié est différent | Le journal d'audit dit lequel (`invitation-refused`, raison). Invitez de nouveau avec l'email qu'a le fournisseur |
| `` `email` is required `` (400) | L'adresse est vide ou mal formée | Donnez une adresse complète |
| `` `role` is owner, dev or reviewer `` (400) | Un autre nom de rôle | Utilisez l'un des trois |
| `usage: studio-server invite --email <email> --role <owner\|dev\|reviewer> --config <file>` (code 2) | Un drapeau manque, ou un drapeau est à la place d'une valeur | Donnez les deux drapeaux avec leur valeur |
| `this login has expired or was already used: start again` (400) | La page de connexion est restée ouverte plus de 10 minutes, ou a été rechargée | Rouvrez le lien d'invitation |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Une ligne en base (`studio_invitations` : l'email, le rôle, l'empreinte du jeton, son expiration), puis une ligne de
membre quand elle est acceptée ; deux lignes d'audit. Aucun fichier du jeu.

<a name="recovery"></a>

## Revenir en arrière

Un mauvais rôle se change dans **Members…** (voir [Gérer les membres](team.members.md#change-role)). Une personne qui
n'aurait pas dû entrer se retire au même endroit.

<a name="references"></a>

## Références

- [Rôles et actions](team.roles.md), [Gérer les membres](team.members.md).
- [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (`invite`, `accept`).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md).
