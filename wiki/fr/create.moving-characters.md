# Faire bouger les personnages : patrouilles et marches

Faire marcher un personnage tout seul : un garde qui patrouille dans une salle, une infirmière qui va d'une salle à
l'autre et attrape le héros, Papi qui rentre chez lui une fois la clé trouvée. Tout ici est le DSL tel qu'il est : un
script, `walk`, `moveActor`, un événement et des conditions.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un personnage qui va et vient entre deux endroits d'une salle, ou d'une salle à l'autre, en boucle ou quand quelque
chose arrive ; des règles qui savent où il est ; et un jeu que le solveur prouve toujours, parce que la patrouille fait
partie de l'état qu'il explore.

<a name="context-and-versions"></a>

## Contexte et versions

- Un projet créé (`game/`) ou le dépôt du moteur (`games/<id>/`) ; mêmes fichiers et mêmes commandes, voir
  [la page d'organisation](create.project-layout.md).
- Depuis 4.3.0 pour cette page. Scripts, événements et `moveActor` existent depuis la 1.3 (« World ») ; le schéma 3
  (ids stables, `stepIds`) depuis la 3.0.

<a name="prerequisites"></a>

## Prérequis

- Le personnage déclaré dans `game.ts` avec une pose `walk` dans ses `sprites` (sans elle, il glisse dans sa pose du
  moment) ([personnages](create.characters.md)).
- Les salles placées dans l'éditeur : l'acteur du personnage placé dans chaque salle où il peut se trouver, avec une
  zone de marche ([géométrie](create.geometry.md)).
- [Scripts et événements](create.scripts-events.md), pour les champs utilisés ci-dessous.

<a name="where-to-run"></a>

## Où lancer les commandes

Écrivez le contenu dans les fichiers du jeu (`rooms/<salle>.ts`, `game.ts`, `cast.ts`). Vérifiez depuis la racine du
projet : `npm run validate` et `npm run solve` dans le dépôt du moteur, `npx quest-n-click validate` et
`npx quest-n-click solve` dans un projet créé.

<a name="patrol-in-a-room"></a>

## Étapes : un garde qui patrouille dans une salle

<!-- step: script -->
1. **Un script en boucle dans la salle.** Le garde marche jusqu'au coffre, attend, marche jusqu'à la fenêtre, attend,
   indéfiniment : `{ walk: [x, y], who: 'guard' }` et `{ wait }` dans un script en `loop: true`. Une boucle doit
   contenir un `wait`, `waitUntil` ou `waitEvent`.

<!-- step: flags -->
2. **Dire où il est avec un drapeau.** Les conditions ne savent pas lire la position d'un personnage dans une salle ;
   laissez le script poser un drapeau à chaque arrêt (`{ set: ['guard_at', 'vault'] }`), et les règles le tester
   (`{ flag: 'guard_at', eq: 'vault' }`).

<!-- step: stop -->
3. **Arrêter la patrouille** quand elle ne compte plus : `while: '!vault_open'` ramène le script au début et l'arrête
   une fois le coffre ouvert (ou `{ stopScript: 'guard_patrol' }` depuis une règle).

<!-- step: rules -->
4. **Les règles.** Le cas particulier d'abord : ouvrir le coffre pendant qu'il est devant, c'est se faire prendre ;
   sinon, ça marche.

```room-example
{
  "room": {
    "id": "vault_hall",
    "name": "La salle du coffre",
    "decor": "decor/vault_hall",
    "actors": { "guard": { "char": "guard" } },
    "hotspots": { "vault": { "name": "porte du coffre" } },
    "look": { "guard": "Un garde. Il marche. Il se retourne. Il marche.", "vault": "La porte du coffre." },
    "on": [
      { "id": "hall.vault-watched", "verb": "open", "a": "vault", "if": { "flag": "guard_at", "eq": "vault" },
        "do": [{ "say": ["guard", "Hé ! Éloigne-toi de cette porte."] }] },
      { "id": "hall.vault-open", "verb": "open", "a": "vault", "if": "!vault_open",
        "do": ["Vite, pendant qu'il est à la fenêtre.", { "set": "vault_open" }] }
    ],
    "scripts": [
      { "id": "guard_patrol", "loop": true, "while": "!vault_open",
        "stepIds": ["to-vault", "at-vault", "wait-vault", "to-window", "at-window", "wait-window"],
        "do": [
          { "walk": [520, 340], "who": "guard" },
          { "set": ["guard_at", "vault"] },
          { "wait": 4000 },
          { "walk": [140, 340], "who": "guard" },
          { "set": ["guard_at", "window"] },
          { "wait": 4000 }
        ] }
    ],
    "hints": [{ "id": "hall.hint", "until": "vault_open", "lines": ["Attends que le garde soit à la fenêtre."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "vault": { "rect": [480, 140, 90, 170], "approach": [470, 350] } },
    "actors": { "guard": { "x": 140, "y": 340 } }
  },
  "characters": {
    "guard": { "name": "Garde", "color": "#8fd3ff", "kind": ["person"], "sprites": { "idle": ["guard/idle"], "walk": ["guard/walk1", "guard/walk2"] } }
  }
}
```

Les coordonnées de `walk … who` sont le seul endroit où l'on tape une position : un déplacement scripté. L'endroit où
le garde s'arrête est gardé dans la sauvegarde.

<a name="patrols"></a>

## Étapes : une patrouille d'une salle à l'autre (l'infirmière)

<!-- step: starting-room -->
5. **Donnez au personnage une salle de départ.** Un personnage déclaré comme acteur dans plusieurs salles se montre
   normalement dans toutes (Grand-mère dans la cuisine *et* dans le jardin). Donnez-lui une `room`, et seul son acteur de
   cette salle se montre ; `moveActor` l'envoie ailleurs :

   ```ts
   // cast.ts
   edna: { name: 'Edna', color: '#f0f', room: 'kitchen', sprites: { idle: ['edna/idle'], walk: […] } },
   // hall.ts et kitchen.ts déclarent tous deux   actors: { edna: { char: 'edna' } }   et la placent dans leur layout.
   // n'importe où :  { moveActor: ['edna', 'hall'] }             à sa position du layout dans le hall
   //                 { moveActor: ['edna', 'hall'], at: 'door' } à ce point d'entrée (ou ce point) du hall
   // conditions :    { actorIn: ['edna', 'hall'] }
   ```

   Le personnage disparaît de la salle qu'il quitte et apparaît dans celle qu'il rejoint, à l'écran si le joueur y est.
   Le validateur refuse `moveActor` vers une salle où le personnage n'est pas un acteur, ou pour un personnage sans
   `room`.

<!-- step: patrol-script -->
6. **Un script du jeu la déplace et le dit.** Après chaque déplacement, il déclenche un événement ; un écouteur du jeu
   attrape le héros quand ils se croisent, et le `onEnter` de chaque salle l'attrape quand c'est lui qui entre :

   ```ts
   // game.ts
   scripts: [{ id: 'edna_patrols', loop: true, stepIds: ['w1', 'to-hall', 'moved-1', 'w2', 'to-kitchen', 'moved-2'], do: [
     { wait: 6000 }, { moveActor: ['edna', 'hall'] }, { emit: 'edna_moved' },
     { wait: 6000 }, { moveActor: ['edna', 'kitchen'] }, { emit: 'edna_moved' },
   ] }],
   events: [{ id: 'edna.catches', on: 'edna_moved',
     if: { any: [{ all: [{ room: 'hall' }, { actorIn: ['edna', 'hall'] }] }, { all: [{ room: 'kitchen' }, { actorIn: ['edna', 'kitchen'] }] }] },
     do: [{ say: ['edna', 'Je te tiens !'] }, { goto: 'dungeon' }] }],
   // hall.ts (et pareil dans kitchen.ts) :
   onEnter: [{ if: { actorIn: ['edna', 'hall'] }, then: [{ say: ['edna', 'Je te tiens !'] }, { goto: 'dungeon' }] }],
   ```

   Le cachot a une brique descellée qui ramène au hall. Le jeu entier est une fixture de test,
   [`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts) (`mansion`), et la mécanique est décrite dans
   [mécaniques classiques](create.classics.md#nurse-on-patrol).

<!-- step: checkpoints -->
7. **Points de reprise.** Un point de reprise démarre avec chaque personnage mobile dans sa salle de départ ;
   `where: { edna: 'hall' }` en place un ailleurs. Un point de reprise qui a des `goals` doit être un état que le jeu
   atteint vraiment quand ces buts tiennent : `npm run solve -- --prove --chapters` prouve chaque chapitre depuis chaque
   état frontière atteignable et signale un point de reprise qui n'en reproduit aucun, avec les dimensions qui
   diffèrent (`room: house vs market`). `used`, `seen` et `players[].used` permettent à un point de reprise de nommer ce
   qu'une vraie partie laisse derrière elle (un objet déjà utilisé, un écouteur `once` déjà déclenché)
   ([chapitres](create.chapters.md)).

> [!LIMIT id=turn-by-turn]
> Une patrouille va tour par tour, pas en temps réel. Les scripts tournent entre les actions du joueur, jamais pendant :
> l'infirmière ne peut pas entrer pendant que le héros parle ou marche. C'est ce qui permet au solveur de prouver
> l'énigme (il attend qu'elle parte, puis traverse) et à une sauvegarde de tout restaurer à l'identique. Une séquence
> qui ne doit pas être interrompue va dans une `cutscene`.

> [!LIMIT id=no-position-condition]
> Aucune condition ne lit l'endroit où se tient un personnage dans une salle, ni ce qu'il voit. Représentez « le garde
> est à la porte » par un drapeau que pose le script, et « le garde est dans cette salle » par `{ actorIn }`.

> [!GUARANTEE id=patrol-turn-by-turn]
> Un personnage que déplace un script attrape le héros tour par tour : quand le héros entre dans sa salle, ou quand
> elle entre dans la sienne.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Sur le serveur de développement, le garde fait ses allers-retours pendant que vous jouez ; ouvrir le coffre quand il
  est devant vous vaut un avertissement, quand il est à la fenêtre le coffre s'ouvre.
- `npm run validate` (ou `npx quest-n-click validate`) n'affiche aucune erreur.
- `npm run solve` va jusqu'au bout, et son chemin montre les tours du script comme des étapes
  (`Script edna_patrols`) : le solveur attend que la patrouille bouge, puis agit.

> [!GUARANTEE id=patrol-solved]
> Le solveur prouve le jeu de l'infirmière en patrouille : il laisse tourner son script et attend qu'elle parte.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `loop script "…" never waits (add a wait, waitUntil or waitEvent)` | Une boucle sans pause | Ajoutez un `{ wait }` |
| `schema v3 script needs one stable step id per command (n expected)` | `stepIds` absent ou de la mauvaise longueur | Un id par commande de premier niveau |
| `character "…" has no starting room ("room" in its definition), needed to move it between rooms` | `moveActor` sur un personnage sans `room` | Ajoutez `room` à sa définition |
| `"…" is not an actor in <salle>: declare it there (actors) and place it in the layout` | `moveActor` vers une salle qui ne le déclare pas | Déclarez-y l'acteur et placez-le |
| Le personnage se montre dans toutes les salles à la fois | Pas de `room` sur le personnage | Donnez-lui une salle de départ |
| Le personnage glisse au lieu de marcher | Pas de pose `walk` | Ajoutez `walk` à ses `sprites` |
| La patrouille s'arrête pour de bon après un échange d'objet | Un `while` vérifié avant chaque commande | Gagnez le nouvel objet avant de perdre l'ancien |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`rooms/<salle>.ts` (le script, les règles et le `onEnter` de la salle), `game.ts` (scripts du jeu, écouteurs, points
de reprise), `cast.ts` (la salle de départ), `layout/<salle>.json` (l'acteur placé dans chaque salle). Dans une
sauvegarde : la position du script, l'endroit où se trouve chaque personnage mobile (`where`), la position de chaque
acteur et les drapeaux que pose le script.

<a name="recovery"></a>

## Reprise ou retour arrière

Retirer un script ou renommer ses étapes change ce que contient une ancienne sauvegarde : ajoutez une étape de
migration (`renameScript`, `renameScriptStep`, `dropScript`) quand des joueurs ont des sauvegardes
([état et sauvegardes](create.state-saves.md)).

<a name="references"></a>

## Références

- [Scripts et événements](create.scripts-events.md), [drapeaux, variables et événements](create.flags-variables-events.md), [conditions](create.conditions.md),
  [mécaniques classiques](create.classics.md).
- [`src/engine/core/movement.ts`](../../src/engine/core/movement.ts),
  [`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts),
  [`tests/classics.test.ts`](../../tests/classics.test.ts).
