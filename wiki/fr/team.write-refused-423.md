# Écriture refusée sur le Studio hébergé : pan verrouillé (423)

Sur un Studio d’équipe, votre enregistrement a été refusé avec une 423 : un autre membre modifie la même partie du
jeu. Votre changement n’est pas perdu, et rien n’a été écrit. Cette page explique comment savoir pourquoi, et comment
faire passer votre changement.

<a name="symptom"></a>

## Symptôme

- Dans le Studio (en anglais) : une fenêtre « The room *kitchen* is held by Léa » (ou « The span *story* is held
  by… », ou « The whole game is held by… »), avec « Your change was not applied. Nothing is lost: your draft is kept
  here, to save when the span is free. »
- Par l’API, la CLI ou le MCP : un HTTP **423** avec `{"error": "room:kitchen is being edited by Léa", "span",
  "holder", "holderName", "until"}`, ou `"<name> has the whole game for now"`, ou `"your lease on <span> ended or was
  taken again: take it again"`.

<a name="causes"></a>

## Causes possibles

Chaque fichier du jeu appartient à un *pan* : une salle (son code et sa disposition), une langue, l’histoire, les
objets, la distribution, les règles, les voix, les images, les notes, les regroupements de la carte, le reste.
Enregistrer un fichier vous donne son pan pendant **120 secondes** : c’est un *bail* (un verrou). Votre Studio
renouvelle vos baux toutes les 30 secondes tant qu’il reste ouvert. Alors :

1. **Un autre membre tient le bail de ce pan** : il a enregistré dans cette salle, ou l’a prise d’avance, et son Studio
   est encore ouvert (ou a été fermé il y a moins de deux minutes). C’est le cas le plus courant.
2. **Un membre tient le bail exclusif** (`*`) : tout le jeu est à lui le temps d’un job qui touche à tout. Prepare et
   le découpage de l’onglet Assets le prennent pour le dev qui les lance ; une mise à jour du moteur et un import depuis
   Git le prennent pour le propriétaire qui les lance ; chacun le rend à la fin de son job. Un propriétaire peut aussi
   le prendre à la main. Personne d’autre n’écrit pendant ce temps.
3. **Le bail d’un script a expiré ou a été repris.** Un client qui renvoie les jetons de bail reçus (`x-studio-fences`)
   est refusé quand son bail a expiré ou qu’un propriétaire a repris le pan entre-temps. Seuls les clients de l’API qui
   choisissent de les envoyer le voient ; le Studio et le MCP ne les envoient pas. Votre propre bail ne vous refuse
   jamais, quel que soit votre onglet.

> [!LIMIT id=hosted-only]
> Les pans et les baux n’existent que sur un Studio hébergé (le Studio Server). Le Studio local (`npm run studio`) n’a
> qu’une personne et jamais de 423.

<a name="diagnosis"></a>

## Diagnostic

- La fenêtre nomme le détenteur. Le panneau *Spans* du Studio liste qui tient quoi, et jusqu’à quand ; il suit les
  événements en direct du serveur.
- En membre, `GET /api/leases` donne chaque bail : `span`, `holderName` et `until` (une heure de l’horloge du serveur,
  en millisecondes).
- Un pan `*` dans la liste est un bail exclusif : son `holderName` est le membre dont le job (ou la main) le tient.
- Le message « your lease on … ended or was taken again » est la cause 3, et seul un script qui envoie
  `x-studio-fences` le voit.

<a name="fix"></a>

## Correction

<!-- step: wait -->
1. **Attendre.** Cliquez sur « Tell me when it is free » : le Studio vous prévient dès que le bail est rendu ou
   expire. Un bail expire 120 secondes après que le Studio du détenteur a cessé de le renouveler (onglet fermé, machine
   en veille) ; tant que son Studio reste ouvert, il le garde, alors demandez-lui (étape suivante). Cliquez ensuite sur
   « Try again » : votre brouillon part tel quel.

<!-- step: ask -->
2. **Demander.** Dites au détenteur que vous avez besoin de cette salle. Dès qu’il libère le pan dans son panneau
   *Spans*, il est libre.

<!-- step: owner-takeover -->
3. **Reprendre le pan (propriétaire seulement).** Un propriétaire peut cliquer sur « Take over and save (owner) » : le
   pan devient le sien et le changement est enregistré. L’écriture suivante de l’ancien détenteur dans ce pan est
   refusée à son tour. La reprise est inscrite au journal d’audit (`lease-takeover`, avec l’ancien détenteur). Par
   l’API : `POST /api/leases/takeover` avec `{"span": "room:kitchen"}`.

<!-- step: exclusive-lease -->
4. **Le bail exclusif.** Quand quelqu’un tient tout le jeu (`*`) pour un job (Prepare, un découpage, une mise à jour
   du moteur, un import depuis Git), attendez la fin du job : le bail est rendu avec lui. Un propriétaire qui l’a pris à
   la main le rend avec `POST /api/exclusive/release`, ou le bail expire. Le prendre à la main (`POST /api/exclusive`)
   et le rendre à la main reviennent à un propriétaire ; il n’est accordé que si personne d’autre ne tient de pan.

Pour la cause 3, le script reprend le pan (`POST /api/leases` avec `{"spans": ["room:kitchen"]}`), garde les nouveaux
jetons reçus, puis renvoie son écriture.

<a name="check-fixed"></a>

## Vérifier que c’est corrigé

L’enregistrement passe : le Studio affiche la nouvelle révision, et le panneau *Spans* montre le pan comme le vôtre.
Par l’API, l’écriture répond 200 avec la révision qu’elle a créée.

<a name="neighbours"></a>

## Cas voisins

- **409, « The file changed since you read it »** : personne ne tient le pan, mais quelqu’un a enregistré le même
  fichier après que vous l’avez ouvert. Ce n’est pas un verrou ; voir
  [Écriture refusée sur le Studio hébergé : révision de base périmée (409)](team.write-refused-409.md).
- **503 avec `Retry-After`** : l’instance ne sert pas encore les écritures, pendant un redéploiement. Attendez
  quelques secondes ; le Studio réessaie.
- Un Reality Bridge ne répond jamais 423.
