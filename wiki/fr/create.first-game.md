# Votre premier jeu

Le plus court chemin entre rien et une salle jouable sur votre téléphone, avec, à chaque étape, les fichiers que vous
touchez.

<a name="overview"></a>

## Ce que vous allez construire

Un jeu d'une salle à partir du modèle : un jardin, un seau, un portail. On prend le seau, on l'utilise sur le portail,
c'est fini. Vous y ajoutez une lampe que le héros peut allumer : vous la racontez d'abord dans le storyboard, vous
écrivez sa règle, vous la placez à la souris, vous vérifiez le jeu avec le validateur et le solveur, et vous y jouez
sur votre téléphone. Les étapes sont prévues pour une quinzaine de minutes. Tout ce que vous écrirez ensuite est une
variation de ce qui est déjà là.

**Le contenu est une donnée.** Salles, accessoires à états, personnages, objets, règles, conversations, indices,
scripts et événements sont de simples objets TypeScript, sans code dedans : chaque outil peut les lire, les vérifier
et y jouer.

```ts
export const garden: RoomDef = {
  id: 'garden', name: 'Le jardin', decor: 'garden',
  props: { tank: { name: 'citerne', states: { full: 'tank_full', empty: 'tank_empty' } } },
  exits: { back_door: { name: 'porte de derrière', to: 'house', entry: 'garden' } },
  on: [
    { verb: 'use', a: 'pipe', b: 'tank', if: '!tank_drained',
      do: [{ minigame: 'pipes' }, { lose: 'pipe' }, { set: 'tank_drained' }, { prop: ['tank', 'empty'] }] },
  ],
  hints: [{ until: 'tank_drained', lines: ['Utilise le tuyau sur la citerne.'] }],
};
```

Une règle, c'est un verbe, une cible, une condition et une liste de commandes. Ce dont un jeu a besoin au-delà, une
commande sur mesure, est du TypeScript à lui : du code de confiance, nommé dans le jeu et haché avec lui
([code sur mesure](create.custom-code.md)). Des mécaniques célèbres du genre sont écrites ainsi dans
[mécaniques classiques](create.classics.md). Le Studio, c'est le vrai moteur avec un éditeur par-dessus : les salles et
leurs placements, le storyboard case par case, les vérifications après chaque enregistrement
([le Studio local](studio.overview.md)).

**Images, sons et langues.** Un prompt pour chaque planche, chaque objet et chaque décor dans un même style, et des
planches découpées en sprites ([images](create.images.md)) ; une musique chiptune arrangée depuis un MIDI et des
bruitages tirés d'une même palette ([musique](create.music.md), [bruitages](create.sound-effects.md)) ; chaque
réplique traduisible, une traduction manquante repérée avant la release ([traductions](create.translations.md)).

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Node 22.13 ou plus récent : le Studio local (étape 5) et les outils qui écrivent un jeu en ont besoin ; 22.12 ne
  sert qu'à jouer et construire un jeu ([prérequis](install.requirements.md#node)). Python 3 avec Pillow pour
  `npm run assets` (`python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt`
  dans un projet créé, `python3 -m pip install --require-hashes -r requirements.txt` dans le dépôt du moteur).
- Un téléphone sur le même réseau, pour la dernière étape (facultatif).
- Un des deux endroits où travailler, avec les mêmes étapes ([lequel est lequel](create.project-layout.md)) :
  - **un projet créé**, où le jeu est `game/` ; les chemins de cette page disent `game/` ;
  - **le dépôt du moteur**, où le jeu est `games/<id>/` (ici `games/lamp/`).

<a name="steps"></a>

## Étapes

<a name="from-the-template"></a>

### 1. Un jeu à partir de l'archive de la release (deux minutes)

<!-- step: create -->
Les paquets ne sont pas encore sur le registre npm : un jeu part donc de l'archive que chaque release GitHub joint
([installer depuis l'archive de release](install.from-archive.md)). Prenez la dernière version sur
<https://github.com/Quest-n-Click/quest-n-click/releases/latest> puis, dans un dossier vide de votre choix :

```sh
# dans le dossier qui contiendra le projet : crée le dossier my-game
V=4.5.0             # la version de la release que vous prenez
T=https://github.com/Quest-n-Click/quest-n-click/releases/download/v$V/quest-n-click-$V.tgz
npx --package=$T quest-n-click create my-game "My Game" --engine=$T
cd my-game
npm install
python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
npm run assets      # les images provisoires dans public/assets
npm run dev         # http://127.0.0.1:5173/ : un jardin, un seau, un portail
```

Les paquets sont sur npm depuis la 4.5.2 : `npm init @quest-n-click my-game "My Game"` crée le même projet depuis le
registre, sans URL d'archive ([installer depuis npm](install.from-npm.md)).

Ou, dans le dépôt du moteur, le même modèle devient `games/lamp`, choisi comme jeu courant (`.cache/game`) :

```sh
# dans le dépôt du moteur
npm install
npm run new-game lamp "The Lamp"
npm run assets
npm run dev
```

Vous voyez un jardin. Le modèle est un jeu complet d'une salle. Ses images sont provisoires, dessinées à partir de
formes (`tools/placeholder-art.py`) : `provenance.json` le dit, et une release les refuse tant que chaque fichier n'est
pas remplacé et relu.

<a name="read-the-room"></a>

### 2. Lire la salle que vous allez changer (deux minutes)

<!-- step: read-room -->
`game/rooms/start.ts` (`games/lamp/rooms/start.ts`) est toute la salle. Lisez-la de haut en bas : `props` (les
choses qui ont une image), `hotspots` (des endroits du décor), `look` (une réplique, ou trois qui tournent, pour chacun),
`on` (les règles : un verbe, une cible, une condition, ce qui se passe), `hints` (ce que dit l'objet d'indices, tant
qu'un drapeau n'est pas posé), `onEnter`. La géométrie n'est pas là : `layout/start.json` dit où sont les choses, et
seuls le Studio ou l'éditeur de placement l'écrivent ([géométrie](create.geometry.md)).

<a name="story-then-check"></a>

### 3. Raconter d'abord, dans le storyboard (deux minutes)

<!-- step: story -->
`storyboard.json` est la source de vérité du texte : l'histoire s'y écrit avant la salle
([le storyboard](create.storyboard.md)). Ajoutez une case à la planche du jardin, après celle du seau :

```json
{ "id": "start-lamp", "title": "La lampe", "action": "Use lamp", "lines": [{ "who": "hero", "text": "Et la lumière fut." }] }
```

L'onglet Storyboard du Studio montrera cette case comme pas encore faite : l'étape suivante la réalise, avec la même
réplique.

<a name="add-a-prop"></a>

### 4. Ajouter l'accessoire et sa règle (cinq minutes)

<!-- step: add-prop -->
Ajoutez la lampe au jardin. Dans `rooms/start.ts` :

```ts
props: {
  bucket: { name: 'seau', img: 'starter/items/bucket' },
  lamp: { name: 'lampe', states: { off: 'starter/items/bucket', on: 'starter/items/note' }, initial: 'off' },
},
look: {
  // …
  lamp: ['Une lampe de jardin. Éteinte.', 'Toujours éteinte.', 'Elle réfléchit.'],
},
on: [
  // …
  { id: 'start.light-lamp', verb: 'use', a: 'lamp', if: '!lamp_on',
    do: [{ set: 'lamp_on' }, { prop: ['lamp', 'on'] }, 'Et la lumière fut.'] },
],
```

Les images provisoires n'ont pas de lampe : elle emprunte donc les deux images d'objets du modèle, celle du seau quand
elle est éteinte, celle de la note quand elle est allumée. C'est un pis-aller, mais le changement se voit. Pour une vraie
lampe, `npm run prompts` écrit le prompt et l'onglet Assets du Studio découpe ce que vous générez
([images](create.images.md)). Une règle est un verbe, une cible, une condition et une liste de commandes ; une chaîne
dans `do` est une réplique du héros, celle du storyboard. `{ prop: ['lamp', 'on'] }` change l'état de l'accessoire,
`{ set: 'lamp_on' }` le retient dans la sauvegarde ([réactions](create.reactions.md), [commandes](create.commands.md)).

<a name="place-it"></a>

### 5. La placer (deux minutes)

<!-- step: place -->
```sh
# dans le projet créé, ou dans le dépôt du moteur
npm run studio      # le Studio s'ouvre ; onglet Rooms, « start »
```

La lampe n'a pas encore de place : le Studio la montre à l'endroit par défaut. Faites-la glisser où vous voulez,
ajustez sa hauteur, enregistrez : `layout/start.json` gagne une entrée `lamp`. Ne tapez jamais de coordonnées à la
main ; l'éditeur et le Studio sont faits pour ça. Tant qu'elle n'est pas placée, `validate` dit
`no position in the layout`.

<a name="check-it"></a>

### 6. Vérifier (trois minutes)

<!-- step: check -->
L'onglet Storyboard montre maintenant la case de la lampe comme faite ; l'onglet Check relance le validateur et le
solveur après chaque enregistrement. Depuis le terminal :

```sh
# dans le dépôt du moteur
npm run validate   # un accessoire sans texte Regarder, un drapeau que rien ne lit, une règle inaccessible : c'est dit ici
npm run solve      # un chemin gagnant de Nouvelle partie à la fin, étape par étape (pas la preuve que personne ne reste bloqué)
npm test           # les tests du moteur et la soluce de votre jeu (games/lamp/tests/game.test.ts)
```

```sh
# dans le projet créé
npx quest-n-click validate
npx quest-n-click solve
npm run verify     # validate, solve, i18n status, lint, playtests
```

`solve` s'arrête au premier chemin vers la fin qu'il trouve : un autre chemin peut encore mener le joueur dans une
impasse. `npm run solve -- --prove` (`npx quest-n-click solve --prove`) en cherche une dans tous les états qu'il peut
atteindre, dans ses budgets ([ce que prouve le solveur](create.solver-proofs.md)). Une règle dont le solveur n'a jamais
besoin n'est pas un bug (la lampe est décorative), mais `npm run lint` (`npx quest-n-click lint`) vous dit qu'elle
l'est ([vérifier son jeu](create.checking.md)).

<a name="play-on-your-phone"></a>

### 7. Y jouer sur votre téléphone (deux minutes)

<!-- step: play-phone -->
```sh
# dans le dépôt du moteur
npm run dev:lan     # le serveur sur votre réseau ; ouvrez l'URL affichée sur le téléphone, en paysage
```

Un projet créé n'a pas de `dev:lan` : [tester sur un téléphone par le réseau local](create.lan-testing.md) dit comment
faire. Touchez la lampe avec Utiliser. Avant : la lampe montre l'image du seau. Après : le héros dit « Et la lumière
fut. », la lampe montre l'image de la note, et un second Utiliser ne déclenche plus la règle (son `if: '!lamp_on'`).
Rechargez la page : la lampe est toujours allumée, car la sauvegarde retient `lamp_on` et l'état de l'accessoire.

> [!LIMIT id=tutorial-scope]
> Ce tutoriel laisse de côté les images (la lampe emprunte les images provisoires du modèle), la carte, les
> personnages et les conversations, et la publication. Chacun a sa page ci-dessous.

<a name="what-you-learned"></a>

## Ce que vous avez appris

C'est la boucle : raconter dans le storyboard, écrire la règle, la placer, vérifier, jouer
([la boucle de travail](create.working-loop.md)).

- Le storyboard vient d'abord : les répliques de la salle sont celles du storyboard ([le storyboard](create.storyboard.md)).
- Une salle est une donnée : accessoires, zones, textes Regarder, règles ([salles](create.rooms.md)).
- La géométrie vit dans `layout/`, placée à la souris ([géométrie](create.geometry.md)).
- Le validateur et le solveur vérifient le jeu après chaque changement ; `solve` trouve un chemin gagnant,
  `solve --prove` cherche les impasses ([vérifier son jeu](create.checking.md)).

<a name="next"></a>

## Et ensuite

- [Salles](create.rooms.md), champ par champ ; [réactions](create.reactions.md) ; [commandes](create.commands.md) ;
  [conditions](create.conditions.md).
- [Mécaniques classiques](create.classics.md) : des énigmes célèbres écrites avec ces champs.
- [Le Studio local](studio.overview.md), et [concevoir les énigmes](create.puzzle-design.md) pour un jeu entier, de la
  première idée à la release.
