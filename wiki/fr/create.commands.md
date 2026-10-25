# Commandes du jeu

Les commandes que lance une règle, un sujet de conversation, un script ou un écouteur, rangées par ce qu'elles font.
Chaque commande est une donnée : une simple chaîne, ou un objet dont la clé nomme la commande. La
[référence du DSL](create.dsl.md), générée, donne la forme exacte de chaque commande, champ par champ ; cette page dit
ce que fait chacune et quand s'en servir.

<a name="overview"></a>

## Comment s'exécutent les commandes

Une liste de commandes (`do`, `then`, `onEnter`…) s'exécute dans l'ordre, chaque commande attendant la fin de la
précédente. Une commande écrite en simple texte fait parler le héros : `'Voilà. Un marchepied.'`. Le catalogue des
commandes est [`src/engine/core/cmds.ts`](../../src/engine/core/cmds.ts) (`CMD_KEYS`) : il dit quelles commandes
changent l'état du jeu (ce qui compte pour le solveur et les sauvegardes) et lesquelles ne font que montrer quelque
chose. Une clé qu'il ne connaît pas est refusée par le validateur.

<a name="speech"></a>

## Parole

| Commande | Effet |
|---|---|
| `'texte'` | Le héros dit la réplique. |
| `{ say: ['grandma', 'texte'] }` | Un personnage parle. `'hero'` désigne toujours le héros, quel que soit son id. Un personnage `offscreen` (narrateur, radio) parle dans un cadre en haut de l'écran. |
| `{ say: ['grandma', 'ATTENTION !'], shout: true }` | Un cri : texte plus gros, et il tremble. |
| `{ say: [...], id: 'house.l-careful' }` | Une réplique à id stable : sa traduction et son clip de voix suivent l'id ([traductions](create.translations.md)). |
| `{ say: [...], voice: 'grandma_01' }` | Joue ce clip de `audio.voices` ; la réplique reste tant qu'il joue ([voix](create.voices.md)). |

Une réplique reste à l'écran le temps de la lire, ou jusqu'à un tap. `validate` prévient au-delà de 140 caractères ;
sous 90, elle se lit confortablement sur un téléphone ([dialogues](create.dialogues.md#writing)).

<a name="movement"></a>

## Déplacements et poses

| Commande | Effet |
|---|---|
| `{ walk: 'shelf' }` | Le héros marche jusqu'au point d'approche de l'étagère (posé dans le layout). |
| `{ walk: [300, 350], who: 'grandpa' }` | Papi marche jusqu'à ce point (tout acteur de la salle ; sans pose `walk`, il glisse dans sa pose du moment). L'endroit où il s'arrête est gardé dans la sauvegarde. |
| `{ face: 'left' }`, `{ face: 'grandma' }`, `{ face: 'hero', who: 'grandma' }` | Se tourner vers la gauche, ou vers quelqu'un ou quelque chose (le héros compris). En cinématique, personne n'est la cible d'une action, donc personne ne se tourne tout seul : c'est ainsi que deux personnages se regardent. |
| `{ pose: ['cat', 'sleep'] }` | Une pose durable (jusqu'à la suivante). Les poses d'un personnage : voir sa planche `sprites`. |
| `{ anim: ['hero', 'use'], ms: 600 }` | Tenir la pose le temps donné, puis revenir à la normale. Marche pour tout acteur de la salle, même en `pose: 'front'` : `{ anim: ['grandpa', 'surprise'], ms: 900 }` joue la pose `surprise` de sa planche, puis il revient à `front`. `at: { 2: [{ sfx: 'thud' }] }` lance des commandes quand la pose atteint cette image. |
| `{ place: ['grandpa', [420, 360]], face: 'left' }` | Téléporter un personnage. |
| `{ launch: { target: 'vase', to: [420, 310], height: 60, rotate: 360, ms: 900 } }` | Physique de scène (3.4) : un vol balistique d'un accessoire ou d'un personnage, depuis où il est (ou `from`) jusqu'à `to`, un point ou une chose. Calculé, jamais simulé : le même vol sur chaque appareil. Un personnage reste où il atterrit ; un accessoire jusqu'à la prochaine entrée dans la salle : faites suivre ce que ça signifie (`{ hide: 'vase' }`, `{ prop: ['vase', 'broken'] }`). |
| `{ spring: { target: 'lamp', axis: 'rot', amplitude: 12, frequency: 3, damping: 0.25 } }` | Un balancement ou une secousse amortie autour de sa place (`axis` x, y ou rot). |
| `{ path: { target: 'bat', points: [[80, 120], [300, 60], [560, 140]], orient: true } }` | Le long d'une courbe douce passant par les points, orienté selon elle. |
| `{ follow: { target: 'parrot', leader: 'hero', offset: [10, -70], ms: 3000 } }` | Garde l'un à distance fixe de l'autre pendant un temps. |
| `{ wait: 500 }` | Pause, en millisecondes. Dans un script, le joueur continue de jouer pendant ce temps. |
| `{ parallel: [[…], […]] }` | Jouer plusieurs listes en même temps (par exemple deux personnages qui marchent). |
| `{ camera: … }`, `{ play: [prop, anim] }`, `{ stopAnim: prop }` | La caméra d'une salle large et les animations d'accessoires : [géométrie](create.geometry.md#camera), [mise en scène](create.staging.md). |

Avec les animations réduites, chaque mouvement saute à sa fin. Les mouvements (`launch`, `spring`, `path`, `follow`)
ne sont que de la présentation : le solveur ne les voit pas. Faire marcher un personnage tout seul, une patrouille :
[faire bouger les personnages](create.moving-characters.md).

<a name="world"></a>

## Le monde

| Commande | Effet |
|---|---|
| `{ prop: ['lamp', 'on'] }` | Changer l'état d'un accessoire. `'salle.accessoire'` vise une autre salle. |
| `{ show: 'ghost', fade: 1200 }`, `{ hide: 'ghost', fade: 1500 }` | Faire apparaître ou disparaître un acteur ou un accessoire, avec un fondu facultatif. Gardé dans la sauvegarde. |
| `{ gain: 'rope' }`, `{ lose: 'rope' }` | Ajouter ou retirer un objet d'inventaire. `gain` sur un objet marqué `used` le réactive. |
| `{ used: 'rope' }`, `{ used: ['rope', 'badge'] }` | L'objet a servi : il reste dans le sac, grisé ([objets](create.items.md#used)). |
| `{ set: 'tied' }`, `{ set: ['tries', 3] }`, `{ unset: 'x' }`, `{ inc: 'tries' }`, `{ inc: 'tries', by: -1 }` | Les drapeaux : cases à cocher, compteurs et valeurs, nommés comme vous voulez ([drapeaux, variables et événements](create.flags-variables-events.md)). |
| `{ unlock: 'market' }` | Débloquer un lieu sur la carte. Un lieu verrouillé n'apparaît pas ([carte du monde](create.world-map.md)). |
| `{ goto: 'market', at: 'gate' }` | Changer de salle ; `at` est un point d'entrée du layout, ou un point. |
| `{ map: true }` | Ouvrir la carte. |
| `{ moveActor: ['grandpa', 'house'], at: 'door' }` | Envoyer un personnage dans une autre salle ([faire bouger les personnages](create.moving-characters.md)). |
| `{ emit: 'bell_rang' }` | Déclencher un événement : ses écouteurs s'exécutent sur-le-champ ([scripts et événements](create.scripts-events.md#events)). |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | Lancer un script depuis le début, ou l'arrêter ([scripts](create.scripts-events.md#scripts)). |
| `{ waitUntil: COND }`, `{ waitEvent: 'gong' }` | Dans un script : attendre qu'une condition tienne, ou un événement. |
| `{ switchPlayer: 'laverne' }`, `{ transfer: ['tentacle', 'hoagie'] }` | Plusieurs personnages jouables : prendre le contrôle d'un autre, passer un objet à un autre ([héros](create.heroes.md)). |
| `{ custom: 'sparkle', args: { ms: 1200 } }` | Une commande que le jeu définit en code ([code sur mesure](create.custom-code.md)). |

<a name="audio"></a>

## Audio et effets

| Commande | Effet |
|---|---|
| `{ sfx: 'coin' }` | Bruitage. `caption: '[Une porte claque à l’étage]'` écrit ce qu'il signifie pour qui ne l'entend pas ([bruitages](create.sound-effects.md)). |
| `{ music: 'market' }` | Changer de musique (fondu enchaîné). |
| `{ music: { push: 'minigame' } }` puis `{ music: { pop: true } }` | Une musique temporaire, puis retour au morceau précédent. |
| `{ music: { once: 'jingle' } }` | Jouer un morceau une fois par-dessus, puis la musique reprend. |
| `{ music: { stinger: 'success' } }` | Un court motif (un morceau de `audio.music` ou un son de `audio.sfx`) sur le prochain temps de la partition en cours (3.5) ; tout de suite avec un mixage unique ([musique](create.music.md)). |
| `{ music: { stop: true } }` | Arrêter la musique. |
| `{ toast: 'Nouveau lieu : le marché' }` | Un petit message en haut de l'écran (`id` lui donne un id stable pour sa traduction). |
| `{ shake: 400 }` | L'écran tremble, pendant ce nombre de millisecondes. |

<a name="logic"></a>

## Logique

| Commande | Effet |
|---|---|
| `{ if: COND, then: […], else: […] }` | Embranchement selon une [condition](create.conditions.md). |
| `{ once: […], id }` | Une seule fois dans toute la partie. |
| `{ nth: [[…1re fois], […2e fois], […ensuite]], id }` | Selon le nombre de fois ; la dernière branche se répète. |
| `{ cycle: [[…], […]], id }` | En boucle : 1, 2, 1, 2… (par exemple un tourne-disque qui alterne deux morceaux). |
| `{ random: [[…], […]], id }` | Au hasard, jamais deux fois la même de suite. |

En schéma 3, chacun de `once`, `nth`, `cycle` et `random` demande un `id` stable : son compte est gardé dans la
sauvegarde sous cet id (`key` est l'ancien nom, de la v2). Retenir quelque chose pour plus tard, c'est un drapeau
(`set`) ; signaler un moment, c'est un événement (`emit`) : [lequel choisir](create.flags-variables-events.md).

<a name="sequences"></a>

## Séquences et écrans

| Commande | Effet |
|---|---|
| `{ cutscene: […] }` | Cinématique : bandes noires, un bouton « Passer ». Passer joue le reste instantanément : les effets (objets, drapeaux, états) s'appliquent quand même. |
| `{ choice: [{ id, text, do, if?, once?, img? }, …] }` | Le joueur choisit une réplique ; le héros la dit, puis `do` se joue. `img` montre l'option comme une carte avec cette image ([dialogues](create.dialogues.md#choice)). |
| `{ talk: 'grandma' }` | Ouvrir le menu de conversation d'un acteur depuis un script. |
| `{ minigame: 'pipes', params: { tiles: …, cols: 4 }, then: […] }` | Lancer un mini-jeu. Un mini-jeu ne se perd jamais : `then` se joue toujours, même si l'on passe. Toutes ses images viennent de `params` ([mini-jeux](create.minigames.md)). |
| `{ phone: 'grandma', do: […] }` | Appel entrant : sonnerie (`skin.sounds.phone`), un bouton Décrocher, puis les répliques de `do`. Pendant l'appel, l'appelant apparaît dans un cadre de téléphone (en bas à gauche), la bouche animée quand il parle ; ses répliques s'affichent en haut. |
| `{ phone: ['lou', 'seller'], do: […] }` | Un appel à plusieurs : tous côte à côte dans le même cadre (le premier devant), chacun à sa taille (`height`). Chaque `{ say: ['lou', …] }` anime la bonne bouche. Pose montrée : la première de `skin.callPoses` qui existe (par défaut `phone`, `front`, `face`, `idle`) ; bouches tirées de `mouths.phone` (sinon la pose `phone_talk` alterne, sinon un petit rebond). Les ids sont des personnages de `characters` (aucun acteur nécessaire dans la salle). |
| `{ guide: { verb: 'look', target: 'shelf', say: 'Choisis Regarder, puis touche l’étagère.' } }` | Tutoriel : le héros donne la consigne, le verbe clignote, la cible brille. On attend que le joueur fasse exactement cette action ; toute autre action répète la consigne. |
| `{ hint: true }` | Donner l'indice courant (comme parler à l'objet d'indices). |
| `{ ending: true, after?: […] }` | La fin scellée (`GameDef.ending`) : ticket à gratter, confettis, puis `after`, puis la carte finale. `{ reveal: true }` est l'ancien nom, toujours accepté ([la fin scellée](create.sealed-ending.md)). |
| `{ end: true }` | Fin de partie. |

> [!LIMIT id=custom-for-the-rest]
> Ce qu'aucune de ces commandes ne fait demande une commande sur mesure, écrite en TypeScript avec ses effets déclarés
> ([code sur mesure](create.custom-code.md)). Aucune commande ne lance du code arbitraire depuis le contenu.

<a name="related"></a>

## Identifiants liés

- La forme exacte de chaque commande : [la référence du DSL](create.dsl.md). Les types : `Cmd` dans
  [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts).
- [Réactions](create.reactions.md), [conditions](create.conditions.md),
  [scripts et événements](create.scripts-events.md).
