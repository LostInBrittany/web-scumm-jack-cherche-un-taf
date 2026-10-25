# Débuter comme dev invité

Vous avez reçu un lien d'invitation pour un Studio d'équipe. En un quart d'heure environ, vous allez vous connecter,
trouver vos repères, faire un premier changement à votre nom, le voir dans le jeu, et savoir comment ne pas gêner vos
coéquipiers.

<a name="what-you-will-build"></a>

## Ce que vous allez faire

Rien de nouveau dans le jeu pour l'instant : une première petite modification (une note, ou une ligne de texte dans une
salle), enregistrée comme une révision à votre nom, et visible dans l'aperçu du jeu. À la fin, l'en-tête du Studio
affiche « revision N » avec votre changement, et votre avatar parmi les personnes présentes.

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Le lien d'invitation qu'un owner vous a envoyé. Il ne sert qu'une fois, dans les 7 jours.
- Un compte chez le fournisseur d'identité de l'équipe (Keycloak, GitLab ou un autre) dont l'**email est vérifié** et
  correspond à celui de l'invitation.
- Un navigateur de bureau récent : Chromium, Firefox, ou Safari sous macOS. Le Studio hébergé est expérimental ; Safari
  est la passe humaine `studio-hosted`, pas encore faite.
- Rien à installer sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: open-link -->
1. **Ouvrez le lien d'invitation.** Vous arrivez sur la page de connexion du fournisseur. Connectez-vous avec l'email
   invité. Vous revenez au Studio. *Vous voyez* le Studio et ses onglets : Rooms, Storyboard, Map, Assets, Voices,
   Music, Check, Play, Language, Remix, Notes.

   Si vous voyez plutôt « Access not granted », l'invitation ne correspond pas : elle a expiré, a déjà servi, ou votre
   email vérifié est différent. Demandez-en une nouvelle à l'owner ([Invitations](team.invitations.md#common-errors)).

<!-- step: read-header -->
2. **Lisez l'en-tête.** De gauche à droite : « revision N » (la révision courante du projet ; son point est vert tant
   que le flux en direct fonctionne), la santé du jeu à une révision, un avatar par personne présente (survolez-le pour
   savoir où elle est), et votre nom avec votre rôle (« Léa · dev ▾ »). Votre nom ouvre un menu : **Spans…**,
   **Log out** (et **Members…** pour un owner). *Vous voyez* votre propre avatar parmi les autres.

<!-- step: open-spans -->
3. **Voyez qui tient quoi.** Cliquez sur votre nom, puis **Spans…**. Chaque salle, et chaque autre partie du jeu
   (objets, personnages, règles, histoire, une langue, voix, assets, notes, la carte, playtests, signaux, le reste), est
   listée avec son détenteur ou « free ». *Vous voyez* dans quelles salles travaillent vos coéquipiers. Fermez le
   panneau.

<!-- step: first-edit -->
4. **Faites un premier changement.** Ouvrez l'onglet **Notes** et ajoutez une note (« Bonjour, je suis sur la cuisine
   aujourd'hui »), ou ouvrez une salle libre dans **Rooms** et changez une ligne de texte, puis enregistrez. *Vous
   voyez* l'en-tête passer à la révision suivante. Dans l'onglet Rooms, la pastille de la salle dit maintenant « held
   by you » : enregistrer vous a donné son pan pour deux minutes, renouvelées tant que votre Studio est ouvert.

<!-- step: see-preview -->
5. **Voyez-le dans le jeu.** La vue de salle montre le jeu comme l'aperçu d'une révision. Son étiquette dit « preview
   of revision N », puis « revision N+1 building… » : le worker du serveur construit votre révision. Quelques instants
   plus tard, la vue la charge d'elle-même. Dans l'onglet **Play**, cliquez sur **Load the latest preview** pour la
   jouer. *Vous voyez* votre changement.

<!-- step: check -->
6. **Vérifiez le jeu.** Dans **Check**, lancez le validateur et le solveur. *Vous voyez* les résultats, avec la
   révision à laquelle ils ont été faits ; ils sont marqués périmés dès que quelqu'un écrit de nouveau.

<!-- step: comment -->
7. **Dites quelque chose sans écrire le jeu.** Dans **Notes**, le panneau **Comments** prend un commentaire sur une
   salle, un objet, une règle ou le jeu lui-même, à la révision courante. Vos coéquipiers le voient aussitôt. Voir
   [Commentaires](team.comments.md).

<!-- step: log-out -->
8. **Déconnectez-vous** depuis le menu sous votre nom quand vous avez fini votre journée, ou fermez simplement
   l'onglet : vos pans sont libérés deux minutes plus tard.

> [!LIMIT id=tutorial-not-covered]
> Ce tutoriel laisse de côté ce qu'un dev ne fait pas le premier jour : l'onglet Assets (uploads et découpe), Prepare,
> la publication de builds, Git et la montée de version du moteur. Un Studio hébergé n'a pas de captures, pas encore
> d'Assistant, et l'inspecteur d'état, l'explication des règles et les rejeux à côté de l'onglet Play demandent le
> Studio local (voir [Limites connues](team.limits.md)).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Chaque enregistrement est une révision à votre nom ([Concepts](team.concepts.md#revision)).
- Enregistrer un fichier vous donne son pan, et le pan d'un autre refuse votre enregistrement
  ([Concepts](team.concepts.md#lease), [423](team.write-refused-423.md)).
- Le jeu que vous voyez est l'aperçu d'une révision ([Concepts](team.concepts.md#preview)).
- Votre rôle décide de ce que vous pouvez faire ([Rôles et actions](team.roles.md)).

<a name="next"></a>

## Pour aller plus loin

- [Travailler ensemble au quotidien](team.day-to-day.md) : la routine, l'annulation, les conflits.
- [Reprendre après un bail perdu, une déconnexion ou un aperçu périmé](team.recovery.md).
- [MCP distant](team.remote-mcp.md) : un agent IA qui travaille à votre nom.
