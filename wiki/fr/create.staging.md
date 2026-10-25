# Mise en scène : salles larges et animations

Comment un lieu bouge : un lieu plus large que l’écran, avec une caméra qui suit le héros ; des animations
d’accessoires dont les images déclenchent sons et effets ; et les réglages du joueur, qui changent la façon dont tout
cela se joue (animations réduites, vitesse du texte, volumes). Cette page est la référence de `layout.width`, de la
commande `camera`, de `PropDef.anims`, de `play`, de `stopAnim`, des événements de frame et de `settings`.

<a name="overview"></a>

## La mise en scène en un coup d’œil

| Vous voulez | Vous écrivez | Section |
|---|---|---|
| Un lieu qui défile | `width` dans le layout du lieu, un décor plus large | [Lieux larges et caméra](#wide-rooms) |
| Déplacer la vue | `{ camera: … }` | [Lieux larges et caméra](#wide-rooms) |
| Un accessoire animé, avec un son sur la bonne image | `anims` sur l’accessoire, `{ play: [accessoire, nom] }` | [Animations d’accessoires](#animations) |
| Une entrée Réglages dans le menu pause | `settings: true` dans `game.ts` | [Réglages](#settings) |
| Une réplique doublée | `voice` sur `say`, `audio.voices` | [Voix](create.voices.md) |
| Calques, lumières, particules, plusieurs sols | `stage` dans le lieu | [La scène](create.stage.md) |

La sous-partie « Voix » de l’ancien guide du contenu, qui se trouvait dans ce chapitre, est désormais dans
[Voix](create.voices.md).

<a name="wide-rooms"></a>

## Lieux larges et caméra

### Forme

Un lieu fait 640 × 400 unités logiques. Donnez à son layout une `width` (960, 1280… : dossier « Room width » de
l’éditeur du Studio, ou dans le fichier de layout du lieu, `game/layout/<lieu>.json` dans un projet créé,
`games/<id>/layout/<lieu>.json` dans le dépôt du moteur) et peignez son décor aussi large, 800 px de haut et la largeur
en proportion ; l’outil `assets` la garde. Le lieu défile alors, et la **caméra** suit le héros. Les positions restent
des coordonnées du monde : un accessoire à x 900 est dans la partie droite du lieu.

Des commandes déplacent la caméra :

| Commande | Effet |
|---|---|
| `{ camera: { to: 'etals_lointains', ms: 900 } }` | Panoramique pour centrer quelque chose (acteur, accessoire, zone), puis reste là. |
| `{ camera: { pan: 320, ms: 600 } }` | Panoramique vers un bord gauche, en unités logiques (borné au lieu). |
| `{ camera: 'follow' }` (ou `'reset'`) | Suivre à nouveau le héros. Entrer dans un lieu suit toujours le héros. |

### Valeurs et défaut

- `width` : 640 en l’absence (pas de défilement).
- `ms` : la durée du panoramique, facultative.
- Entrer dans un lieu remet la caméra à suivre le héros.

### Contraintes

La caméra est dans l’état (`camera` : son bord gauche, et si elle suit) : une sauvegarde la restitue. Le solveur
l’ignore. « Réduire les animations » (le réglage, ou le `prefers-reduced-motion` du système) rend chaque panoramique
instantané.

### Exemple minimal

```ts
// in a rule of a room whose layout has width: 1280
{ verb: 'look', a: 'far_stalls', do: [{ camera: { to: 'far_stalls', ms: 900 } }, 'The far stalls.', { camera: 'follow' }] }
```

### Comportement sur un champ inconnu

La commande `camera` n’accepte que les formes ci-dessus ; TypeScript signale une autre forme dans un lieu typé.

### Depuis

Lieux larges et caméra : 1.5.0 « Picture ». Une caméra qui zoome aussi selon la zone de marche et se déplace
verticalement : 3.4.0 (voir [La scène](create.stage.md)).

La géométrie (où peut aller la caméra, les zones qui la font zoomer) est aussi décrite dans
[Géométrie](create.geometry.md#camera).

<a name="animations"></a>

## Animations d’accessoires et événements de frame

### Forme

```ts
props: {
  garde_manger: { name: 'garde-manger', states: { ferme: 'home/r1c3', ouvert: 'home/r1c4' }, initial: 'ferme',
    anims: { secoue: { frames: ['home/r1c4', 'home/r1c3', 'home/r1c4', 'home/r1c3'], fps: 12, at: { 1: [{ sfx: 'loquet' }] } },
             halo: { frames: ['home/g1', 'home/g2'], fps: 4, loop: true } } },
},
on: [{ verb: 'open', a: 'garde_manger', do: [{ play: ['garde_manger', 'secoue'] }, 'Fermé.'] }],
```

Une animation (`PropAnim`, [src/engine/core/types/content.ts](../../src/engine/core/types/content.ts)) a :

| Champ | Sens |
|---|---|
| `frames` | Des ids d’images du manifeste, montrées tour à tour. |
| `fps` | Images par seconde. |
| `loop` | Tourne toute seule jusqu’à ce qu’on l’arrête. |
| `at` | Numéro d’image → commandes exécutées quand cette image est atteinte. |

### Valeurs et comportement

- `{ play: [accessoire, nom] }` montre les images l’une après l’autre à `fps` et **exécute les commandes de `at` quand
  cette image est atteinte** (un son sur la bonne image, un drapeau, une réplique). La commande attend la fin de
  l’animation, puis l’accessoire reprend l’image de son état.
- Une animation `loop` tourne toute seule jusqu’à `{ stopAnim: accessoire }`, et `play` ne l’attend pas. Son `at` ne
  joue que des sons et des secousses (`sfx`, `shake`), à chaque tour de boucle : une machine qui claque à l’image 4,
  c’est `glow: { frames: […], loop: true, at: { 4: [{ sfx: 'clank' }] } }`.
- Les poses des personnages ont les mêmes événements de frame : `{ anim: ['hero', 'saut'], ms: 600, at: { 2: [{ sfx: 'boum' }] } }`
  exécute les commandes quand la pose atteint cette image, au `fps` du personnage.

### Contraintes

Le validateur refuse un drapeau ou une réplique dans le `at` d’une animation `loop` : la boucle ne finit jamais, l’état
ne se poserait jamais.

### Comportement sur un champ inconnu

TypeScript le signale sur un accessoire typé ; le moteur ne le lit pas.

### Depuis

Animations d’accessoires et événements de frame (`at`) : 1.5.0 « Picture ». L’état d’une animation en boucle n’est que
de la présentation et n’est pas sauvegardé : après un chargement, l’accessoire montre l’image de son état jusqu’à ce
qu’une commande relance la boucle (voir [État et sauvegardes](create.state-saves.md#what-a-save-holds)).

<a name="settings"></a>

## Réglages

### Forme

`settings: true` dans `game.ts` ajoute une entrée **Réglages** au menu pause.

### Valeurs et défaut

Chaque ligne fait défiler sa valeur :

| Réglage | Valeurs | Défaut |
|---|---|---|
| Vitesse du texte | lent / normal / rapide | normal |
| Taille du texte | normal / grand | normal |
| Réduire les animations (pas de tremblement, caméra et fondus instantanés, ni parallaxe, ni particules, ni transition de lieu) | oui / non | non (ou oui quand le système demande des animations réduites) |
| Police lisible, quand le jeu en fournit une (`skin.fonts.readable`) | oui / non | non |
| Volumes musique, sons et voix | — | au maximum |
| Sous-titres des sons, proposés seulement quand le jeu sous-titre un son | oui / non | oui |
| Touches des verbes, proposées seulement quand un verbe a une `key` (4.3.0) | oui / non | oui |
| Langue, quand le jeu fournit des traductions | les langues du jeu | `?lang=` dans l’URL, sinon le dernier choix, sinon la langue du navigateur si le jeu l’a, sinon la langue dans laquelle le jeu est écrit |

Les préférences restent dans le navigateur, **hors sauvegarde** : localStorage `<jeu>.settings`, et `<jeu>.lang` pour
la langue. Une nouvelle partie ou un chargement ne les change pas.

Les libellés des lignes sont des textes d’interface de `ui` : `settings`, `textSpeed`, `textSize`, `reduceMotion`,
`readableFont`, `volumeMusic`, `volumeSfx`, `volumeVoice`, `captions`, `verbKeys`, `language`, et les valeurs `slow`,
`normal`, `fast`, `large`. Chacun a une valeur anglaise par défaut quand il est absent (la liste complète est dans
[Habillage et polices](create.skin-fonts.md#ui-defaults)).

### Contraintes

Sans `settings: true`, pas d’entrée Réglages ; les animations réduites suivent quand même la préférence du système.

### Depuis

`settings` : 1.5.0 « Picture ». Sous-titres : 3.4.0. Touches des verbes : 4.3.0.

> [!LIMIT id=settings-per-browser]
> Les réglages appartiennent à un navigateur sur un appareil : ils ne voyagent pas avec un fichier de sauvegarde
> exporté, et une fenêtre privée les oublie.

Ce que le joueur voit de ces réglages, et ce qu’ils apportent à l’accessibilité, est dans
[Les réglages, côté joueur](play.settings.md) et [Accessibilité](play.accessibility.md).

<a name="related"></a>

## Identifiants liés

- `stage`, `walkZones` avec `zoom`, `transition` : [La scène](create.stage.md).
- `anim` (poses des personnages), `shake`, `sfx` : [Commandes du jeu](create.commands.md).
- `skin.fonts.readable`, les textes de `ui` : [Habillage et polices](create.skin-fonts.md).
