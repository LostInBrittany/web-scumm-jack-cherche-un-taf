# Travailler ensemble au quotidien

Sur un Studio d'équipe, plusieurs personnes modifient le même jeu en même temps. Cette page décrit la routine : voir
qui est où, garder une salle pour soi le temps d'y travailler, enregistrer sans écraser personne, suivre les
changements des autres, et annuler les siens.

<a name="what-you-get"></a>

## Ce que vous obtenez

Vos changements arrivent comme des révisions à votre nom, le travail de personne n'est écrasé sans qu'il le voie, et
vous voyez arriver les changements des autres.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server), depuis la 4.2.3 : la vérification de ce que chaque éditeur a lu
(`x-studio-base`) est arrivée en 4.2.3, l'annulation personnelle en 4.2.2, les pans et le flux en direct en 4.2.1.
Les mots *pan* et *bail* sont expliqués dans [Concepts](team.concepts.md).

<a name="prerequisites"></a>

## Prérequis

- Un compte de membre avec le rôle `dev` (un reviewer lit, joue et commente ; voir [Rôles et actions](team.roles.md)).
- Vous vous êtes déjà connecté une fois (voir [Débuter comme dev invité](team.first-day.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans votre navigateur, dans le Studio, à son URL publique. Rien ne tourne sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: see-who -->
1. **Voir qui est là.** L'en-tête montre la révision où vous êtes (« revision N », son point vert tant que le flux en
   direct fonctionne), la santé du jeu, et un avatar par membre présent, avec l'endroit où il est (un onglet, une
   salle). La présence est envoyée toutes les 30 secondes et disparaît après 60 secondes sans nouvelles.

<!-- step: hold-room -->
2. **Garder la salle où vous travaillez.** Chaque salle de l'onglet Rooms affiche une pastille : libre, « held by
   you », ou le nom de son détenteur. Vous n'avez rien à faire : **enregistrer un fichier vous donne son pan** pour 120
   secondes, renouvelées toutes les 30 secondes tant que votre Studio est ouvert. Pour réserver une salle avant de
   commencer, ouvrez **Spans…** (votre nom dans l'en-tête) et cliquez sur **Take**. Chaque fichier appartient à un
   pan : une salle (son code et son layout), une langue, l'histoire, les objets, les personnages, les règles, les voix,
   les assets, les notes, les regroupements de la carte du scénario, les playtests, les signaux Reality, le reste
   (`meta`).

<!-- step: edit-save -->
3. **Modifier et enregistrer comme d'habitude.** Votre enregistrement est une opération ; l'en-tête passe à la
   nouvelle révision. Si quelqu'un d'autre tient ce pan, l'enregistrement est refusé par une 423 qui le nomme, et votre
   brouillon reste chez vous : voir [Écriture refusée : pan verrouillé (423)](team.write-refused-423.md).

<!-- step: what-you-read -->
4. **Enregistrer vérifie ce que vous avez lu.** Chaque écriture porte la révision que son éditeur a lue
   (`x-studio-base` ; chaque lecture répond avec sa révision dans `x-studio-revision`). Si quelqu'un d'autre a écrit
   l'un des mêmes fichiers depuis, l'écriture est refusée (409) avec ce fichier tel que vous l'avez lu et tel qu'il est
   maintenant. Les écritures faites depuis par le même onglet ne la refusent jamais ; celles de votre autre onglet, ou
   d'un agent à vous, si. Le Studio montre ce qui a changé et garde votre brouillon :

   - pour une modification que le serveur fait sur le fichier (un texte, une valeur, une note, une voix), il propose
     **Apply my edit on the latest version** ;
   - pour un document entier (le layout d'une salle, le storyboard, les regroupements de la carte), il propose
     **Replace with my version (drops their change)**, et le dit.

   Rien n'est renvoyé sans que vous le demandiez. Voir
   [Écriture refusée : révision de base périmée (409)](team.write-refused-409.md).

<!-- step: follow-others -->
5. **Suivre les autres.** Le Studio écoute `GET /api/events` : chaque révision avec son auteur et ses fichiers, qui
   tient quoi, qui est là, les aperçus et la santé. Les éditeurs rechargent ce que les autres confirment. La vue du
   jeu montre l'aperçu d'une révision ; une étiquette dessous dit quand un plus récent est prêt (voir
   [Reprendre après un aperçu périmé](team.recovery.md#stale-preview)).

<!-- step: undo -->
6. **L'annulation est la vôtre.** Undo et Redo (Ctrl/Cmd+Z, avec Maj pour rétablir) reprennent **votre** dernière
   opération, quoi que les autres aient écrit entre-temps, par une nouvelle révision : l'historique n'est jamais
   réécrit. L'annulation est refusée quand quelqu'un d'autre a écrit l'un de ses fichiers depuis (409), ou tient son
   pan (423, avec son nom). Une nouvelle modification de votre part efface ce que vous pouviez rétablir. Votre pile
   est gardée par le serveur : un autre onglet, un redémarrage, une autre instance voient la même.

<!-- step: release -->
7. **Lâcher quand vous avez fini.** Dans **Spans…**, **Release** rend un pan que vous tenez ; ou fermez simplement le
   Studio : vos baux expirent 120 secondes après qu'il a cessé de les renouveler.

> [!LIMIT id=per-file]
> La vérification de la 409 se fait par fichier : deux notes modifiées en même temps sont un seul fichier
> (`notes.json`), donc elles se refusent l'une l'autre. Le placement de la vue de salle est vérifié par rapport à ce
> que l'onglet Rooms a lu, alors que la vue peut encore montrer un aperçu plus ancien un instant. Un script ou un agent
> qui n'envoie pas `x-studio-base` (les clients de la CLI et du MCP n'en envoient pas) n'est pas vérifié ainsi : ses
> écritures se font sur le fichier tel qu'il est, dans les règles des pans.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Votre enregistrement affiche une nouvelle révision dans l'en-tête. `GET /api/ops?after=<rev>` (ou l'historique) liste
votre opération à votre nom. Les autres la voient aussitôt sur leur écran.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| « The room *kitchen* is held by Léa » (423) | Quelqu'un tient ce pan | [423](team.write-refused-423.md) |
| « The file changed since you read it » (409) | Quelqu'un a enregistré le même fichier après votre ouverture | [409](team.write-refused-409.md) |
| « Reconnecting… last revision seen: N » | Le flux en direct est coupé | [Reprise](team.recovery.md#disconnection) |
| « N changes not answered yet, sent again with the same id » | Une écriture attend sa réponse (un redéploiement, une coupure) | Attendez : chacune s'applique une fois ([Reprise](team.recovery.md#writes-waiting)) |
| `undo is not available on this shared Studio` (409) | Un Studio partagé configuré sans annulation personnelle | Ce n'est pas le cas d'un Studio Server standard ; signalez-le |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Chaque enregistrement est une opération du journal : les fichiers du jeu à une nouvelle révision, à votre nom. Les
baux et la présence vivent dans la base et en mémoire ; ce ne sont pas des fichiers du jeu.

<a name="recovery"></a>

## Revenir en arrière

Annulez votre propre opération, ou demandez à l'auteur d'une autre d'annuler la sienne. Revenir plus loin (une
journée entière) passe par la restauration d'une sauvegarde : voir [Sauvegardes](clever.backups.md).

<a name="references"></a>

## Références

- [Concepts](team.concepts.md), [Rôles et actions](team.roles.md).
- [Reprendre après un bail perdu, une déconnexion ou un aperçu périmé](team.recovery.md).
- [Commentaires](team.comments.md), [Carte et diff sémantique](team.map-diff.md).
- [`src/studio/api.ts`](../../src/studio/api.ts) (ce qu'envoie le Studio), [`src/studio/spans.ts`](../../src/studio/spans.ts).
