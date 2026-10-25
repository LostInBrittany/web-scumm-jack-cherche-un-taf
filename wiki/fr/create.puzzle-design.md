# Concevoir des énigmes

Un guide pratique et assumé pour un auteur, souvent seul avec un assistant IA : quoi écrire pour que le jeu soit drôle,
juste et terminé. Le format est dans les pages [Créer un jeu](create.rooms.md), la méthode dans
[Travailler avec une IA](create.working-with-ai.md) ; cette page parle de goût.

<a name="overview"></a>

## L’exemple suivi

Le jeu d’exemple, *The Pantry Key* (`games/demo/` dans le dépôt du moteur) : Pixel le chat, trois lieux (`house`,
`garden`, `market`), environ 15 minutes. Chaque id cité ici existe dans ce dossier. Les textes du jeu sont en anglais ;
ils sont cités tels quels. Les extraits de code sont simplifiés : les fichiers du jeu d’exemple portent aussi l’id
stable de chaque réplique (`{ id, text }`), qu’ajoute le contrat d’identité ([État et sauvegardes](create.state-saves.md)).

<a name="what-works"></a>

## Ce qui fait marcher ces jeux

Les aventures LucasArts classiques (Monkey Island, Day of the Tentacle) ont fixé quelques règles. Elles tiennent
toujours.

| Règle | Ce que ça veut dire ici |
|---|---|
| **Pas de mort** | Le héros ne meurt jamais et ne perd jamais. Un mini-jeu intégré ne se rate pas : le gagner ou le passer joue `then`. |
| **Pas d’impasse** | Le joueur ne peut jamais arriver dans un état où le jeu ne peut plus être fini. `npm run solve -- --prove` le prouve (`npm run solve` trouve un chemin gagnant). |
| **Chaque action a une réponse** | N’importe quel verbe sur n’importe quoi donne une réplique. Un essai raté est une blague, pas un silence. |
| **L’humour est dans les échecs** | L’essentiel de ce que lit le joueur, ce sont des réactions à de mauvaises idées. C’est là qu’est la voix. |
| **Réfléchir, pas chercher le pixel** | Tout ce qui sert est nommé, visible et a une réplique Regarder. L’énigme est dans la tête, pas dans la zone cliquable. |
| **Peu de personnages, des voix fortes** | Quatre ou cinq personnages qu’on reconnaît en une réplique. |
| **Un but par lieu** | Le joueur sait toujours ce qu’il veut ici. Le storyboard le dit dans `goal`. |
| **10 à 20 minutes par lieu** | Assez pour explorer, assez court pour finir dans le bus. |

Le jeu d’exemple les suit toutes. Pixel ne peut pas échouer. Tirer Biscuit donne « Never pull a cat. Cat law, article
one. » La clé n’est jamais cachée dans un coin : elle est dans une cuve dont un personnage vous parle.

Dans un projet créé, le solveur se lance avec `npx quest-n-click solve` (et `npx quest-n-click solve --prove`). Ce que
chaque résultat permet de conclure est dans [Ce que prouve le solveur](create.solver-proofs.md).

<a name="story-first"></a>

## L’histoire d’abord

Écrivez l’histoire avant tout fichier de lieu. Quatre réponses, une ligne chacune :

| Question | Le jeu d’exemple |
|---|---|
| La prémisse en une phrase | Grandma a enfermé les sardines dans le garde-manger et perdu la clé. |
| Ce que veut le héros | Pixel veut les sardines. |
| L’obstacle par lieu | Maison : personne ne sait où est la clé. Jardin : elle est tombée dans une cuve au robinet coincé. Marché : elle sert de caution pour une lanterne. |
| La fin | Le garde-manger s’ouvre, deux chats pour une boîte, la carte scellée juge le pari du joueur. |

Si ce tableau ne se remplit pas, n’ouvrez pas encore l’éditeur. Écrivez ensuite l’histoire en storyboard, un tableau
par lieu et une case par temps fort, et relisez-le sur un téléphone jusqu’à ce que l’auteur le dise final : voir
[Le storyboard, source de vérité](create.storyboard.md#write-it). Alors seulement, écrivez les lieux.

<a name="repeated-looks"></a>

### Le rythme des regards répétés

Une liste `look` tourne, une réplique par regard. Suivez le rythme **normal, normal, normal, absurde** : trois
répliques utiles ou sobres, puis une blague qui récompense le joueur qui insiste. Le garde-manger du jeu d’exemple :

```ts
pantry: ['The pantry cupboard. The sardines live in there.',
  'Locked. I can hear the sardines. (Sardines are silent. I hear them anyway.)',
  'Still locked. Still sardines.', 'I could stare at it all day. I might.'],
```

Deux répliques suffisent pour le décor (`gnome` : « He has seen things. » puis « He never blinks. Respect. »). Ne
mettez jamais la solution seulement dans la quatrième réplique.

<a name="puzzles"></a>

## Concevoir les énigmes avec ce moteur

<a name="five-shapes"></a>

### Les cinq formes que le DSL gère bien

| Forme | Comment l’écrire | Dans le jeu d’exemple |
|---|---|---|
| **Aller chercher et donner** | règle `give` avec `a` = objet, `b` = acteur | `bouquet` → `seller` donne la `key` |
| **Combiner deux objets** (ou un objet sur une chose) | règle `use` avec `a` et `b` ; dans `rules.on` si ça marche partout | `pipe` sur `tank` |
| **Accessoire à états** | `states` + commande `{ prop: [...] }` + `if: { prop: [...] }` | `armchair` : `remote` → `searched` ; `tank` : `full` → `draining` ; `pantry` : `locked` → `open` |
| **Déblocage par dialogue** | un sujet qui pose un flag ou `unlock` un lieu | « Where is the key? » de Grandma débloque `garden` ; le sujet de Lou pose `deposit_known` |
| **Mini-jeu comme porte** | `{ minigame, params, then }` dans une règle | `pipes` vide la cuve, `pick` fait gagner le bouquet |

Le reste (minuteries, action en temps réel, hasard) se bat contre le solveur. À éviter. Quand une mécanique célèbre
semble demander autre chose, [Mécaniques classiques](create.classics.md) montre comment le DSL l’écrit.

<a name="chains"></a>

### Les chaînes et le « eurêka »

- **3 à 6 étapes par lieu.** Le jardin : prendre `spare_pipe` → utiliser `pipe` sur `tank` → tuyaux → regarder `sock`
  → parler au `shell_phone`. Cinq étapes.
- **Un « eurêka » par lieu.** Celui du jardin, c’est la chaussette : on vide une cuve pour une clé et on trouve un mot.
  Celui du marché, c’est l’anniversaire : le vendeur voulait des fleurs parce qu’il a oublié son anniversaire de
  mariage.
- **Traverser les lieux une ou deux fois.** Le `token` vient du fauteuil de la maison et paie au marché. Ça suffit.
- **Dire le but à voix haute.** Grandpa dit « Drain it. But the tap is stuck. » Le joueur sait *quoi*, pas *comment*.

<a name="hints"></a>

### Les indices dans l’ordre de l’énigme

Chaque lieu a des `hints`. Le moteur donne la première entrée dont la condition `until` est encore fausse. Écrivez-les
dans l’ordre de l’énigme, une entrée par étape, du vague au précis dans une entrée. Le jardin :

```ts
hints: [
  { until: { any: ['pipe_taken', 'tank_drained'] }, lines: ['There is a spare pipe on the ground. Take it, sweetie.'] },
  { until: 'tank_drained', lines: ['Use the pipe on the water tank.', 'Pipe. Tank. Together. Go!'] },
  { until: 'lou_has_key', lines: ['Something came out of the tank. Look at it.'] },
  { until: { unlocked: 'market' }, lines: ['Talk into my shell phone and call Lou.'] },
  { until: { has: 'key' }, lines: ['Lou is at the market. Open the map.'] },
  { until: 'pantry_open', lines: ['Come home with that key, sweetie!'] },
],
```

Deux habitudes : `any` quand une étape peut être sautée (le tuyau a disparu une fois la cuve vidée), et toujours couvrir
la suite du jeu, pour que la voix d’aide ne se taise jamais dans un lieu où le joueur revient.

<a name="puzzle-graph"></a>

### Lire le graphe de puzzles

Avant de toucher une énigme, demandez au graphe ce qui en dépend : `npm run page:puzzles` (dépôt du moteur), le panneau
Puzzles de l’onglet Check du Studio (dans les deux contextes), ou l’outil MCP `puzzle_graph` avec un id. La fiche de la
clé du garde-manger dans le jeu d’exemple dit : obtenue par *give bouquet + seller* ; utilisée par *use key + pantry* et
l’objectif du final ; demande d’abord *bouquet*, *flowers_done*, *bouquet_given* ; débloque le garde-manger et la fin.
Retirez l’échange du bouquet et la fiche dit ce qui casse avant le solveur. Le récapitulatif liste trois mauvaises
odeurs : une chose **lue mais jamais produite** (un flag que personne ne pose), une chose **produite mais jamais
utilisée** (un flag ou un objet qui ne mène nulle part), et un flag **posé seulement par des actions qui l’exigent
déjà** (il ne peut jamais devenir vrai ; le validateur avertit aussi). La page elle-même :
[Pages de relecture](create.review-pages.md#puzzles-page).

Les alertes du solveur (impasses, objets jamais utilisés, objets jamais obtenus) et leur lecture sont dans
[Ce que prouve le solveur](create.solver-proofs.md).

<a name="rooms"></a>

## Les lieux

| Élément | Règle empirique |
|---|---|
| Zones + accessoires nommés + acteurs | **8 à 15** par lieu. Moins, c’est vide ; plus, c’est de la chasse au pixel. La maison du jeu d’exemple a 11 choses nommées. |
| Accessoires à états | Seulement pour ce que l’histoire change (`armchair`, `tank`, `pantry`). |
| Accessoires de décor | Sans `name` = pas cliquable (`table`, `chair`, `stall_left`). Ils habillent la scène. |
| Sorties | Une sortie évidente, au bord de l’écran, nommée d’après sa destination (`back_door` : « Back to Grandma's house. »). |

- **Espace logique : 640 × 400**, origine en haut à gauche, personnages placés par les pieds.
- **La bande de sol.** La zone de marche est dans le bas du décor ; `floor` (395 par défaut) en est le bas. Gardez-la
  libre de meubles dessinés, pour qu’accessoires et acteurs s’y posent.
- **Les tailles des personnages** sont en pixels de cet espace : dans le jeu d’exemple, Pixel fait 36, Grandma 120,
  Grandpa (assis) 100. Un humain entre 110 et 125 dans une pièce de 640 de large se lit bien sur un téléphone.
- **Points d’approche** : posez-les dans l’éditeur (`?edit=<room>`), pour que le héros marche à côté d’une chose, pas
  dessus. `validate` prévient quand une cible de `walk` n’a pas de géométrie.
- **Les sorties sont des choses cliquables**, pas des bords invisibles. Une sortie fermée répond quand même : la
  `window` de la maison dit « Not yet. First, the key. Grandma knows things. » tant que le jardin n’est pas débloqué.
- **Un point de reprise par lieu** dans `game.checkpoints`, avec l’inventaire, les flags et les accessoires que le
  joueur aurait. Le jeu d’exemple a `house`, `garden`, `market`, `finale`. Ouvrez `?dev&at=market` pour tester ce lieu
  seul.

La référence de tout cela est dans [Lieux](create.rooms.md), [Géométrie](create.geometry.md) et
[Sorties](create.exits.md).

<a name="dialogue"></a>

## Les dialogues

- **2 à 4 sujets par personnage, dont un qui fait avancer l’histoire.** Grandma : « Where is the key? » (l’histoire),
  « What is for dinner? » (gag avec `nth`), « Why lock the sardines? » (le personnage). Le sujet utile passe en premier.
- **Les sujets peuvent apparaître et changer** avec `if` : « There was no key in the tank! » de Grandpa n’apparaît
  qu’avec `tank_drained`.
- **`choice` avec parcimonie.** Quand la réponse est drôle à choisir, pas pour faire bifurquer l’histoire. Le jeu
  d’exemple en a deux : le pari d’ouverture (il pose `guess`, jugé à la fin) et « argue or accept » avec Lou, où les
  deux réponses font avancer.
- **Câlin et au revoir sont globaux** (`globalTalk`) : « Can I have a cuddle? » et « Bye! » s’ajoutent à chaque menu.
  Donnez à chaque personnage une réplique `hug` et une réplique `refuse` dans `cast.ts` : ça coûte peu et les joueurs
  adorent.
- **Couleurs de parole** : le `color` de chaque personnage. Rendez-les distinctes : Grandma `#ff9ec4`, Grandpa
  `#8fd3ff`, Lou `#b8ff8f`, le vendeur `#ffb36b`. La voix d’aide `grandma_voice` reprend exprès la couleur de Grandma.
- **La transcription** garde chaque réplique. Les joueurs remontent : ne cachez pas le seul indice dans une réplique de
  cinématique sans autre trace.
- **Longueur pour un téléphone : moins de 90 caractères**, deux lignes à l’écran. `validate` prévient au-delà de 140,
  mais 90 est la limite confortable. Coupez les longues tirades en plusieurs `say`.

Le format est dans [Dialogues](create.dialogues.md).

<a name="fallbacks"></a>

## La couche de repli

La plupart des clics ne touchent aucune règle écrite. Ce qui leur répond, c’est la voix du jeu.

- **`rules.fallbacks` : 3 à 6 variantes par verbe**, tirées au hasard, jamais deux fois de suite. Un tableau par verbe,
  plus `use2` pour « Utiliser A avec B ». Le jeu d’exemple en a deux ou trois ; visez plus dans un vrai jeu.
- **Écrivez-les dans le ton du héros.** Le `push` de Pixel : « It does not move. I need more breakfast. » Son `use2` :
  « These do not go together. Like cats and baths. » `{objet}`, `{cible}` et `{nom}` insèrent les noms.
- **`kinds`** répond à toute une famille d’un coup : chaque `cat` refuse d’être tiré, chaque `person` refuse d’être
  porté. Une `target` précise l’emporte sur un `kind`.
- **`refuse` par personnage** répond à tout Donner sans règle : Lou dit « Thanks, but my pockets are full. Of other
  people's things. »
- **« Ça ne marche pas » n’est jamais acceptable.** Ça n’apprend rien au joueur et ça casse l’ambiance. Une réponse de
  repli est une blague, un rappel de ce que veut le héros, ou les deux.

Le format est dans [Réactions](create.reactions.md).

<a name="minigames"></a>

## Les mini-jeux

Utilisez-en un comme **une porte que le joueur comprend** : la fiction dit pourquoi on y joue. La cuve a besoin d’une
autre sortie, alors on pose des tuyaux. Le vendeur veut des fleurs, alors on les cueille.

- **Toujours un bouton Passer**, sauf le ticket `scratch` de la fin. Passer joue quand même `then` : l’histoire
  continue.
- **30 secondes, pas 3 minutes.** Trois manches de `pick`, une grille 4 × 3 de `pipes`. `helpAfter` fait briller le bon
  tuyau quand le joueur est perdu.
- **Les répliques `intro` et `win`** l’encadrent dans la voix d’aide.

| Mini-jeu | Va avec une fiction sur |
|---|---|
| `pipes` | l’eau, la plomberie, l’arrosage, tout ce qui coule |
| `cables` | l’électricité, un standard, le nœud derrière la télé |
| `pick` | les courses, choisir le bon, une recette, une confrontation |
| `hide` | cache-cache, trouver quelqu’un ou quelque chose dans une scène |
| `runner` | une poursuite, une fuite, une course pour attraper un bus |
| `stroke` | calmer un animal, endormir un bébé |
| `scratch` | la fin scellée seulement |
| `code-wheel` | une roue à codes en carton, la « protection contre la copie » des années 1990 jouée en clin d’œil (4.1.15) |

> [!LIMIT id=code-wheel-can-fail]
> La règle « pas d’échec » vaut pour les mini-jeux intégrés ci-dessus, à une exception près : une `code-wheel` en mode
> `story`, perdue après ses essais, se termine en `failed`. Les paramètres de chaque mini-jeu sont dans
> [Mini-jeux intégrés](create.minigames.md).

<a name="map"></a>

## La carte

- **Ajoutez-en une à partir de trois lieux.** Avec deux, une porte suffit.
- **Les véhicules** (`vehicle: 'car'`, `'plane'`) donnent à chaque trajet une petite animation et une distance.
- **Le marqueur « nouveau »** montre où quelque chose attend. Le jeu d’exemple : le jardin en a un tant que
  `!tank_drained`, le marché tant que le héros n’a pas la clé, la maison quand il tient la clé et que le garde-manger
  est encore fermé.
- **Aucun lieu verrouillé affiché.** Un lieu apparaît quand une règle le `unlock`, avec un `toast` (« New on the map:
  the garden »). Le joueur ne doit jamais voir une épingle inutilisable.

Le format est dans [Carte du monde](create.world-map.md).

<a name="sound"></a>

## Le son

- **Une musique par lieu**, posée avec `music` sur le lieu. Courte et discrète : le joueur l’entend 15 minutes. Le jeu
  d’exemple joue un même thème dans chaque lieu (`music: 'theme'`), découpé en stems pour que le mélange change avec le
  lieu : voir [Musique en stems](create.music.md).
- **Un bruitage à chaque changement d’état.** Fauteuil fouillé : `cloth`. Cuve vidée : `drop`. Garde-manger : `latch`
  puis `door_open`. Objet gagné : `select`, `pluck`, `metal`. Un changement sans son ressemble à un bug.
- **La voix d’aide** est un personnage `offscreen` (`grandma_voice`) qui répond par l’objet d’aide (`shell_phone`).
  Faites-en quelqu’un que le joueur aime, avec un tic (« sweetie »), pour que les indices sonnent comme de l’aide, pas
  comme un manuel.

<a name="alternatives"></a>

## Ce que cette conception écarte

- **La mort et les états d’échec.** Ils punissent l’exploration, et chacun doit être prouvé rattrapable.
- **Les minuteries, l’action en temps réel et le hasard.** Le solveur explore des choix, pas des réflexes ni des dés :
  une énigme qui en dépend ne peut pas être prouvée finissable, et un joueur sur téléphone dans le bus ne peut pas la
  jouer. Quand une histoire veut de l’urgence, un script du monde qui change un objet avec le temps (la chope de grog
  des [Mécaniques classiques](create.classics.md)) la garde prouvable.
- **La chasse au pixel.** Ce qui compte est nommé, visible, et répond à Regarder.

<a name="trade-offs"></a>

## Compromis

Ces règles donnent des jeux justes et prouvables, et des sessions courtes qui tiennent sur un téléphone. Elles coûtent
de la tension : pas d’échéance, pas de défaite, pas de chance. Un jeu qui en veut s’appuie sur un mini-jeu `custom`,
dont le solveur ne voit pas l’intérieur (seulement ses effets déclarés), et renonce pour cela à une partie de la
preuve.

<a name="decisions"></a>

## Décisions et références

- Le jeu d’exemple : [`games/demo/`](../../games/demo/game.ts) (`game.ts`, `rooms/`, `cast.ts`, `rules.ts`,
  `storyboard.json`).
- Tester un jeu comme un joueur, et la liste à cocher avant de partager le lien : [Playtests](create.playtests.md),
  [Vérifier son jeu](create.checking.md).
- [Ce que prouve le solveur](create.solver-proofs.md) · [Mécaniques classiques](create.classics.md) ·
  [Le storyboard](create.storyboard.md) · [Images](create.images.md#art-consistency).
