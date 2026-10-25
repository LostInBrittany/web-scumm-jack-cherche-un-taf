# Modifier une salle

L'onglet Rooms modifie les textes, réactions, sujets de conversation et la scène d'un lieu sans ouvrir son fichier
TypeScript, et réécrit le changement dans ce fichier sous forme de code lisible.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un lieu modifié depuis le Studio : une ligne de Regarder ajoutée, une réaction modifiée par un formulaire, un
accessoire ajouté et placé. Chaque changement est dans `rooms/<lieu>.ts` (ou `layout/<lieu>.json`) comme si vous
l'aviez tapé, validé, et annulable.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local (`npm run studio`), dans le dépôt du moteur ou un projet créé. Vrai depuis la 4.2.1, quand chaque
écriture du Studio est devenue une opération du journal du jeu, jugée avant d'être écrite. Le Studio hébergé utilise
le même onglet, avec baux et rôles en plus ([Travailler ensemble au quotidien](team.day-to-day.md)).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé : [Le Studio local : présentation et lancement](studio.overview.md).
- Un lieu déclaré dans le jeu (`index.ts` / `game.ts`) ; un lieu que le jeu ne liste pas répond
  `room "<id>" is not in the game (index.ts / game.ts)`.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur la page du Studio (`http://localhost:5173/__studio/#rooms/<lieu>`). La seule commande est
celle qui lance le Studio, dans le dépôt du moteur ou le projet créé.

<a name="steps"></a>

## Étapes

<!-- step: select -->
1. **Sélectionnez un élément.** Choisissez le lieu dans l'onglet Rooms. Il est dessiné par le moteur, l'éditeur de
   placement par-dessus ; la liste de droite porte ses accessoires, acteurs et zones cliquables. En sélectionner un,
   dans la liste ou dans la vue, ouvre sa fiche : nom, sorte, états, visibilité, **lignes de Regarder**,
   **réactions** (verbe, cibles, condition, et les commandes en liste de lignes : textes modifiables, autres
   commandes affichées), et **sujets de conversation**, en liste ou en **arbre** (sujets, répliques, choix et leurs
   options, branches, chacun avec sa condition ; toucher un nœud saute à son éditeur). Sous la vue : le nom du lieu,
   les **indices**, les lignes **à l'entrée**, les **scripts** et les **événements** du lieu (structure en lecture,
   textes modifiables).

<!-- step: edit-text -->
2. **Modifiez un texte.** Changez un champ puis quittez-le (ou Entrée) : le texte est enregistré. Échap annule. Chaque
   enregistrement affiche un toast et lance Check en arrière-plan ([Vérifier](studio.check.md)). Un placement en
   cours dans la vue est enregistré d'abord ; la vue se recharge quand le fichier du lieu change. Le texte est écrit
   directement dans `rooms/<lieu>.ts` : le littéral de chaîne est remplacé par l'analyseur TypeScript, avec le même
   style de guillemets, et le fichier reste du code lisible. Les lignes de Regarder s'ajoutent, se modifient et se
   suppriment depuis la fiche.

<!-- step: add-entity -->
3. **Ajoutez un accessoire, une zone cliquable ou un acteur.** « Add prop / hotspot / actor » crée l'entrée dans le
   fichier du lieu (la section est créée si elle manque) et lui donne une place dans le layout : un accessoire a son
   pied au point donné et une hauteur de 60 ; une zone cliquable est une boîte de 60 × 60 centrée dessus ; un acteur y
   a ses pieds. Un accessoire ou une zone cliquable demande un nom. L'id est fait de lettres, chiffres et `_`, sans
   commencer par un chiffre ; un id que le lieu a déjà est refusé (409). Le fichier du lieu et son layout sont écrits
   en une seule opération, annulée en une fois. Glissez-le ensuite à sa place ([Placement et scène](studio.placement.md)).

<!-- step: structured -->
4. **Modifiez une réaction ou la scène par un formulaire** (plus bas, « Édition structurée ») : **Edit…** sur une
   réaction, **+ Reaction** en fin de liste, **Stage…** et le **peintre** sur la fiche du lieu. Chaque formulaire
   montre le diff avant d'écrire ([Aperçu, application, annulation](studio.preview-apply.md)).

<!-- step: timeline -->
5. **Vérifiez le rythme d'un script.** À côté de chaque cinématique, script d'arrivée et script du monde, le bouton
   **Timeline** dessine combien dure chaque commande et ce qui se chevauche : répliques, marches, animations, branches
   parallèles, les tours du joueur en rouge. Toucher une barre saute à sa ligne ; un double-clic sur une barre change
   la durée d'une attente, d'une animation ou d'un mouvement.

<a name="structured-editing"></a>

### Édition structurée

- **Des formulaires plutôt que du code.** Chaque réaction a **Edit…** (verbe, cibles, condition, commandes en
  formulaire), et la liste finit par **+ Reaction**. La fiche du lieu a **Stage…** (calques avec leur image, leur
  rôle et leur condition ; lumières ; émetteurs de particules ; la transition ; la logique des liens de marche) et le
  **peintre** (celui du jeu, DOM ou canvas). Les formulaires viennent d'une seule table de toutes les conditions et
  commandes, [`src/studio/schema.ts`](../../src/studio/schema.ts), vérifiée contre les types du moteur à la
  compilation : une nouvelle commande sans formulaire ne compile pas. Ce qui n'a pas de champ simple (les paramètres
  d'un mini-jeu, les événements d'image d'une animation) est une case JSON.
- **Calques, masques, zones.** Sous la fiche du lieu, l'éditeur de scène ([`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts))
  dessine le fond avec les masques d'occlusion (rouges), les zones de marche (vertes) et les liens entre zones ; la
  géométrie elle-même est décrite dans [Placement et scène](studio.placement.md#stage-editor).
- **Aperçu, puis application.** « Preview the change » montre le diff que le serveur écrirait, sans rien écrire ;
  « Apply » l'écrit en code dans le style du fichier, puis le jeu est validé : une modification qui ajoute une erreur
  de validation est refusée et rien n'est écrit ([Aperçu, application, annulation](studio.preview-apply.md)).
- **Annuler / Rétablir** dans l'en-tête (Ctrl/Cmd+Z, avec Maj pour rétablir), sur toutes les écritures de la
  session : textes, valeurs, layouts, voix.
- **Jouer.** L'onglet Play montre le peintre de chaque lieu (DOM ou canvas, comme le dit le jeu) et sa vitesse de
  dessin (images par seconde, repeints du peintre canvas).

<a name="text-switches"></a>
<!-- applies: 4.3.0.. -->

### Textes qui changent selon le héros

Pour un jeu dont les textes portent des aiguillages (`{form?m=…|f=…}`, `{hero}`), l'onglet Rooms garde les accolades
brutes dans son éditeur de texte. Sous un texte qui porte un aiguillage, une ligne en lecture seule montre le texte
tel qu'un joueur le lit avec les valeurs choisies dans **Text switches** de l'onglet Play (`(form=?)` tant qu'aucune
ne l'est). Voir [Jouer et rejouer une session](studio.sessions.md#text-switches) et
[Héros : plusieurs personnages et choix du héros](create.heroes.md).

<a name="room-notes"></a>

### Notes sur le lieu

Les notes sur le lieu ou une de ses entités apparaissent en bas de la section du lieu (« Notes (n) »), avec une zone
pour en ajouter une ([Notes](studio.notes.md)).

> [!LIMIT id=texts-only-literals]
> Seuls les littéraux de chaîne que le Studio reconnaît comme textes se modifient ainsi : noms, lignes de Regarder,
> répliques de `say`, sujets, indices, toasts, choix, répliques du héros dans les listes de commandes. Les ids,
> références d'image, flags et conditions ne sont jamais des textes, et l'API refuse de les modifier ; un texte que le
> lieu construit par du code (une constante partagée, une fonction) n'est pas atteignable. La règle complète est dans
> [API du Studio](studio.api.md#texts).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le toast dit que le texte est enregistré ; la vue du moteur montre le changement ; `git diff games/<id>/rooms/<lieu>.ts`
montre un changement d'une ligne dans le style du fichier. Le badge de l'onglet Check dit si le jeu se valide encore.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `refused: the edit adds N validation error(s): …` (422) | Le changement casserait le jeu ; rien n'a été écrit | Lire les erreurs, changer la valeur, appliquer à nouveau |
| `"<id>" already exists in room "<lieu>"` (409) | L'id est déjà pris dans ce lieu | Choisir un autre id |
| `` `name` is required for a prop or a hotspot `` | Accessoire ou zone cliquable ajouté sans nom | Donner un nom |
| `cannot undo "<quoi>": <fichier> changed since` (409) | Le fichier a été modifié hors du Studio après cette écriture | Annuler à la main, ou avec git |

Plus : [Dépannage du Studio](studio.troubleshooting.md).

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `games/<id>/rooms/<lieu>.ts` (textes, réactions, scène, peintre, entités ajoutées).
- `games/<id>/layout/<lieu>.json` (la place d'une entité ajoutée).
- Le journal du jeu sous `.cache/studio-journal/` (les opérations, pour annuler).

<a name="recovery"></a>

## Revenir en arrière

Undo dans l'en-tête reprend la dernière écriture de la session, Redo la remet. Une annulation refuse quand le fichier
a été changé depuis par quelqu'un d'autre (une IA, un éditeur, git) : passez alors par `git diff` et
`git checkout -- <fichier>`.

<a name="references"></a>

## Références

- [`src/studio/rooms.ts`](../../src/studio/rooms.ts), [`src/studio/rooms-sheet.ts`](../../src/studio/rooms-sheet.ts),
  [`src/studio/structured.ts`](../../src/studio/structured.ts), [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- `npm run e2e:studio -- <url du Studio>` (bloquant en CI) crée une scène par le formulaire, vérifie le diff,
  l'applique, la voit dans le jeu et l'annule ([`scripts/e2e-studio.mjs`](../../scripts/e2e-studio.mjs)).
- [Lieux](create.rooms.md), [Réactions](create.reactions.md), [Dialogues](create.dialogues.md).
