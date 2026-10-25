# Mécaniques classiques

Les mécaniques célèbres des aventures LucasArts, écrites avec le DSL de ce moteur. Avant de demander une nouvelle
primitive, regardez ici : l’essentiel de ce qui a rendu ces jeux mémorables se fait en combinant des règles, des flags,
des scripts et des événements que le moteur a déjà. Chaque entrée donne un verdict et le DSL qui la réalise.

<a name="overview"></a>

## Les verdicts, et ce qui est testé

| Verdict | Sens |
|---|---|
| **natif** | Le DSL tel quel, quelques lignes ; le validateur et le solveur le comprennent. |
| **faisable** | Le DSL le fait, avec un détour ou une convention à connaître. |
| **custom** | Un mini-jeu du registre ou une commande `custom` : le moteur l’exécute, le solveur ne connaît que ses effets déclarés. |
| **hors champ** | Le moteur ne le fera pas, volontairement. |

Les entrées ont été écrites pour la v2.1 et vérifiées sur le code de la 4.4.0. Chaque entrée « native » est le vrai
DSL. Celles marquées **(testé)** sont jouées par le moteur et prouvées par le solveur dans
[`tests/classics.test.ts`](../../tests/classics.test.ts), à partir des jeux de
[`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts) : le duel d’insultes, le marchandage, la chope qui
fond, l’arbre planté dans le passé et son fruit envoyé par le Chron-O-John, et la ronde de l’infirmière. Le choix du
héros est testé par [`tests/hero-choice.test.ts`](../../tests/hero-choice.test.ts).

Les blocs ci-dessous sont des extraits d’un jeu écrit en TypeScript (`games/<id>/game.ts` et ses salles), pas des
salles entières : ils montrent les clés qui comptent. Une ligne qui commence par `// past:` ou `// hall:` est la partie
qui vit dans le fichier de cette salle.

Où lancer les commandes : elles sont écrites pour le dépôt du moteur (`npm run solve -- --chapters`). Dans un projet
créé, le même solveur est `npx quest-n-click solve --chapters` (et `--prove`), et les sources du jeu sont dans
`game/` au lieu de `games/<id>/`.

> [!GUARANTEE id=classics-insult-duel]
> Défier le maître avant d’avoir appris les insultes ne gagne pas le duel ; une fois que le pirate en a appris deux,
> les bonnes répliques le gagnent et le jeu se termine. Limite : le test joue la fixture de
> `tests/fixtures/classics.ts` (le même DSL que le bloc ci-dessous, avec ses propres mots), pas votre jeu : lancez
> `npm run solve` sur le vôtre.

<a name="monkey-island"></a>

## Monkey Island

<a name="insult-sword-fighting"></a>

### Le combat d’insultes — natif (testé)

Les insultes s’apprennent auprès d’un pirate : chacune est un flag. Le duel est un sujet dont les `choice` ne
proposent que les répliques connues ; les bonnes comptent des victoires, le seuil termine le duel. Pas besoin de
mini-jeu : le combat *est* une conversation.

```ts
talk: {
  thug: [{ topic: 'Battons-nous !', if: '!learned_farmer', do: [{ say: ['thug', 'Tu te bats comme un fermier !'] }, { set: 'learned_farmer' }] }],
  master: [{ topic: 'Je te défie !', do: [
    { say: ['master', 'Tu te bats comme un fermier !'] },
    { choice: [
      { text: 'Comme c\'est approprié, tu te bats comme une vache.', if: 'learned_farmer', do: [{ inc: 'wins' }] },
      { text: 'Ah ouais ?', do: [{ say: ['master', 'Pathétique.'] }] } ] },
    { if: { flag: 'wins', gte: 2 }, then: [{ set: 'master_beaten' }], else: [{ set: ['wins', 0] }] } ] }],
}
```

Le solveur essaie chaque réponse d’un `choice` : il prouve que le duel se gagne, et seulement une fois les insultes
apprises.

<a name="three-trials"></a>

### Les trois épreuves, dans n’importe quel ordre — natif

Trois flags, une règle qui exige les trois, et un checkpoint de chapitre dont les `goals` les listent :
`checkpoints: { pirate: { room: 'bar', goals: ['trial_sword', 'trial_theft', 'trial_treasure'] } }`.
`npm run solve -- --chapters` cherche chaque chapitre depuis le checkpoint précédent jusqu’à ce que ses objectifs
tiennent, quel que soit l’ordre des épreuves ; ajoutez `--prove` pour prouver chaque chapitre depuis chaque état où le
précédent peut se terminer ([Chapitres et objectifs](create.chapters.md), [Options du solveur](create.solver-options.md)).

<a name="haggling"></a>

### Marchander avec le vendeur de bateaux d’occasion — natif (testé)

Un flag numérique *descend* ; un sujet s’ouvre sous un seuil, un autre se ferme.

```ts
start: { room: 'yard', inventory: ['coins'], flags: { price: 8000 } },
talk: { stan: [
  { topic: 'C\'est trop cher.', if: { all: ['asked', { flag: 'price', gte: 6000 }] }, do: [{ inc: 'price', by: -1000 }, { say: ['stan', 'Bon, 1000 de moins !'] }] },
  { topic: 'Marché conclu.', if: { all: ['asked', { flag: 'price', lt: 5001 }, { has: 'coins' }] }, do: [{ lose: 'coins' }, { set: 'ship_bought' }] } ] }
```

Le solveur garde la valeur exacte d’un compteur qui baisse (il ne borne que ceux qui montent).

<a name="grog-mug"></a>

### La chope de grog qui fond — natif (testé)

Un script du monde avec un `while` : tant que le héros porte la chope, le temps la ronge. Il faut se dépêcher, ou la
remplir à nouveau.

```ts
scripts: [{ id: 'mug_melts', loop: true, while: { has: 'mug_grog' },
  do: [{ wait: 8000 }, { gain: 'mug_holey' }, { lose: 'mug_grog' }, { toast: 'La chope a fondu.' }] }]
```

Donnez la nouvelle chope *avant* de retirer l’ancienne : `while` est vérifié avant chaque commande. Le solveur joue
« laisser fondre » comme l’un des choix et trouve quand même le chemin où le héros arrive à temps.

<a name="following-the-storekeeper"></a>

### Suivre le boutiquier jusqu’au maître d’épée — natif

Un script attend que le héros le rattrape, salle après salle :

```ts
scripts: [{ id: 'keeper_leads', do: [
  { waitEvent: 'ask_master' }, { moveActor: ['keeper', 'path'] }, { waitUntil: { room: 'path' } },
  { moveActor: ['keeper', 'forest'] }, { waitUntil: { room: 'forest' } }, { set: 'master_found' }, { moveActor: ['keeper', 'shop'] } ] }]
```

<a name="rubber-chicken"></a>

### Le poulet en caoutchouc avec une poulie au milieu — natif

Une sortie conditionnée, avec sa réplique quand la condition manque :
`exits: { cable: { name: 'câble', to: 'island', if: { has: 'chicken' }, locked: 'Trop loin pour sauter.' } }`
([Sorties](create.exits.md)).

<a name="forest-maze"></a>

### Le labyrinthe de la forêt et la tête navigatrice — faisable

Des salles reliées par des `exits`, plusieurs ramenant à la même salle (`oneWay: true` fait taire le « sans retour »
du validateur), et un flag posé par la tête (`{ set: 'head_points' }`) qui ouvre la bonne sortie
(`if: 'head_points'`). Ça marche, c’est fastidieux à écrire, et la carte du monde du Studio aide plus que le DSL.

> [!LIMIT id=no-generated-maze]
> Ce moteur ne génère pas de labyrinthe : chaque salle du labyrinthe s’écrit à la main.

<a name="under-water"></a>

### Dix minutes sous l’eau avec l’idole — faisable

Un script avec un long `wait` et un `while: { room: 'seabed' }` : à la fin, une cinématique et un `goto` vers une
salle « game over » avec `{ end: true }`.

> [!LIMIT id=no-reload-command]
> Le moteur n’a pas de commande « recharger la dernière sauvegarde ». Le joueur appuie sur Continuer à l’écran titre.
> Une commande `custom` ne le peut pas non plus : son `run` reçoit le jeu, l’état (en lecture seule), la salle, ses
> arguments, le présentateur et la scène, pas le moteur (`CustomContext` dans
> [`src/engine/core/custom.ts`](../../src/engine/core/custom.ts)).

<a name="spitting-contest"></a>

### Le concours de crachat et le vent — natif

Un script en boucle qui lève et baisse un flag, avec une animation d’accessoire en boucle pour le montrer :

```ts
scripts: [{ id: 'wind', loop: true, do: [{ wait: 3000 }, { set: 'wind_blows' }, { play: ['flag', 'flutter'] }, { wait: 3000 }, { unset: 'wind_blows' }, { stopAnim: 'flag' }] }],
on: [{ verb: 'use', a: 'spit', b: 'line', if: 'wind_blows', do: [{ set: 'spit_won' }] }]
```

Comme le solveur fait avancer un script un `wait` à la fois, il voit l’état où le vent souffle.

<a name="map-pieces"></a>

### Les quatre morceaux de carte — natif

Quatre objets, une règle avec `{ all: [{ has: 'piece_1' }, …] }`, ou une liste `goals` sur le checkpoint du chapitre.

<a name="library-catalogue"></a>

### Le catalogue de la bibliothèque — natif

Un `choice` avec autant d’options que de tiroirs, une seule bonne. Depuis la v2.1, le solveur essaie chaque option.

<a name="voodoo-doll"></a>

### La poupée vaudou de Largo, quatre ingrédients — natif

Une règle par ingrédient sur la poupée (`use thread on doll` → `{ set: 'doll_thread' }`), puis l’aiguille, gardée par
`{ all: ['doll_thread', 'doll_bone', 'doll_spit', 'doll_hair'] }`.

<a name="stan-in-the-coffin"></a>

### Stan enfermé dans le cercueil — natif

La règle du cercueil émet un événement ; un écouteur du jeu le déplace :
`events: [{ on: 'coffin_closed', do: [{ moveActor: ['stan', 'coffin'] }, { set: 'stan_boxed' }] }]`.
Chaque salle où Stan peut se trouver le liste dans `actors` ; `{ actorIn: ['stan', 'coffin'] }` garde les règles qui
l’y attendent ([Scripts et événements](create.scripts-events.md)).

<a name="day-of-the-tentacle"></a>

## Day of the Tentacle

<a name="tree-in-the-past"></a>

### L’arbre planté dans le passé, vu dans le futur — natif (testé)

Deux personnages jouables. L’un pose un flag dans sa salle ; une zone de la salle de l’autre est `visible` sous ce
flag.

```ts
players: { ids: ['hoagie', 'laverne'], start: { laverne: { room: 'future' } } },
// past: { verb: 'use', a: 'seed', b: 'ground', do: [{ lose: 'seed' }, { set: 'tree_planted' }] }
// future: hotspots: { tree: { name: 'arbre immense', visible: 'tree_planted' }, stump: { name: 'sol nu', visible: '!tree_planted' } }
```

Les personnages jouables multiples sont décrits dans [Héros](create.heroes.md#several-characters).

<a name="chron-o-john"></a>

### Le Chron-O-John : un objet envoyé dans une autre époque — natif (testé)

`{ transfer: ['fruit', 'hoagie'] }` met l’objet dans le sac de l’autre personnage, où qu’il soit. Donner un objet à un
personnage jouable présent dans la salle fait la même chose.

<a name="frozen-hamster"></a>

### Le hamster congelé — natif

Un objet à états, ce sont deux objets : `{ lose: 'hamster' }, { gain: 'hamster_frozen' }`. Le rapport liste les deux
et d’où ils viennent.

<a name="storm-cutscene"></a>

### L’orage, l’éclair, la cinématique — natif

`cutscene` plus `parallel`, avec des événements de frame sur l’animation :
`{ parallel: [[{ anim: ['sky', 'lightning'], at: { 2: [{ sfx: 'thunder' }, { shake: 4 }] } }], [{ say: ['hoagie', 'Oh oh.'] }]] }`
([Mise en scène](create.staging.md)).

<a name="maniac-mansion"></a>

## Maniac Mansion

<a name="nurse-on-patrol"></a>

### L’infirmière en ronde, et le donjon — faisable, avec une autre horloge (testé)

Un script la déplace entre deux salles et émet un événement après chaque déplacement ; le `onEnter` des salles et un
écouteur du jeu attrapent le héros quand ils se croisent ; le donjon a une brique descellée.

```ts
scripts: [{ id: 'edna_patrols', loop: true, do: [{ wait: 6000 }, { moveActor: ['edna', 'hall'] }, { emit: 'edna_moved' }, { wait: 6000 }, { moveActor: ['edna', 'kitchen'] }, { emit: 'edna_moved' }] }],
events: [{ on: 'edna_moved', if: { all: [{ room: 'hall' }, { actorIn: ['edna', 'hall'] }] }, do: [{ say: ['edna', 'Je te tiens !'] }, { goto: 'dungeon' }] }],
// hall: onEnter: [{ if: { actorIn: ['edna', 'hall'] }, then: [{ say: ['edna', 'Je te tiens !'] }, { goto: 'dungeon' }] }]
```

> [!LIMIT id=patrol-turn-based]
> La différence honnête avec l’original : les scripts tournent *entre* les actions du joueur, jamais pendant. La ronde
> est au tour par tour, pas en temps réel : Edna ne peut pas entrer pendant que le héros parle. C’est ce qui permet au
> solveur de prouver l’énigme (il attend qu’elle parte, puis traverse), et ce qu’une sauvegarde restitue exactement.

Plus sur les rondes : [Déplacer des personnages](create.moving-characters.md#patrols).

<a name="choose-your-hero"></a>

### Choisir son héros au départ — natif (4.3.0, testé)

Maniac Mansion s’ouvre sur un choix d’ados, chacun avec son talent. Quand le choix porte sur *qui est le héros* (la
même histoire, une autre allure, un autre nom et d’autres mots chez les autres : « le », « la »), c’est un seul
personnage avec une variante par héros, un `choice` d’intro à portraits qui pose un drapeau, et des aiguillages dans
les répliques : `'Bonjour, {hero} ! Prêt{form?witch=e|*=} ?'`. `npm run solve -- --prove` vérifie chaque héros
(`npm run solve` seul s’arrête au premier chemin gagnant, et un seul héros peut y suffire). La recette complète, avec
un exemple jouable : [Héros](create.heroes.md#hero-choice) (fixture `tests/fixtures/heroes.ts`). Quand les ados
*accompagnent* le héros et que le joueur passe de l’un à l’autre, c’est `players`
([plusieurs personnages jouables](create.heroes.md#several-characters)).

<a name="doorbell"></a>

### La sonnette — natif

`{ emit: 'doorbell' }` sur le bouton, des écouteurs dans les salles qui réagissent (`once: true` pour le gag unique).

<a name="sam-and-max"></a>

## Sam & Max

<a name="use-max-on"></a>

### « Utiliser Max sur… » — faisable

Le partenaire est à la fois un objet (`items: { max: { name: 'Max' } }`, dans l’inventaire de départ) et un acteur
listé dans les `actors` de chaque salle sans `room` de départ, donc toujours là. `use max on door` est une règle comme
une autre, avec un `anim` de l’acteur. Le moteur n’a pas de notion de « compagnon » ; cette convention suffit.

<a name="running-gag"></a>

### Le gag récurrent quand rien ne marche — natif

`rules.fallbacks` par verbe, une liste pour varier, plus `rules.kinds` pour une réplique par sorte de chose
(`kind: ['glass']`) ([Réactions](create.reactions.md)).

<a name="indiana-jones-loom"></a>

## Indiana Jones, Loom

<a name="three-paths"></a>

### Les trois voies (équipe, ruse, poings) — natif

Un `choice` au début pose un flag ; salles, sujets et règles portent un `if` dessus.
`npm run solve -- --prove --chapters` prouve chaque voie avec un checkpoint de chapitre par branche
(`npm run solve` seul trouve un chemin gagnant, pas chacun).

<a name="fist-fights"></a>

### Les bagarres, les mélodies de Loom — custom

Un mini-jeu du registre (`minigames` exporté par `games/<id>/index.ts`) : le moteur n’en dessine rien, le solveur le
compte gagné. `{ minigame: 'fists', params: { rounds: 3 }, then: [{ set: 'guard_down' }] }`. Pour en écrire un :
[Un mini-jeu sur mesure](create.custom-minigame.md).

<a name="out-of-scope"></a>

## Ce qui reste hors champ

- Un monde en temps réel : les scripts avancent entre les actions ; les animations et les boucles sont la couche temps
  réel ([Scripts et événements](create.scripts-events.md)).
- Un second format de dialogue : sujets, `choice` et `if` sont le graphe de dialogue ; le Studio le dessine.
- La physique, le zoom, une caméra qui bouge sur deux axes.

La liste complète de ce que quest'n'click ne fait pas : [Ce que quest'n'click ne fait pas](index.not-supported.md).
