# Personnages

Un personnage se déclare une fois, dans `game.ts` (`characters`, en général depuis `cast.ts`), et se place dans une
salle comme acteur. Cette page liste les champs d'un personnage, ses poses et ses bouches, les variantes que choisit
son état, les changements de palette, et les personnages que l'on voit sans pouvoir agir dessus.

<a name="characters"></a>

## Un personnage

```ts
characters: {
  grandma: {
    name: 'Grand-mère', color: '#f0c040', height: 124, kind: ['person'],
    portrait: 'grandma/r1c2',
    sprites: { idle: ['grandma/r3c3'], talk: ['grandma/r3c4', 'grandma/r3c3'], walk: ['grandma/r2c1', 'grandma/r2c2', …] },
    refuse: 'C’est gentil, mon chat. Mais garde-le, tu en auras besoin pour ta course.',
    hug: 'Toujours. Même avec un panier dans les bras.',
  },
  talkie: { name: 'le talkie-walkie', color: '#ff6fb5', offscreen: true },   // parle dans un cadre, sans corps
},
```

| Champ | Contenu |
|---|---|
| `name` | Le nom affiché. |
| `color` | La couleur de ses répliques. Donnez à chacun la sienne ([dialogues](create.dialogues.md#writing)). |
| `height` | Taille à l'écran en unités logiques, au premier plan (par défaut `skin.heights` : acteur 110, héros 84). |
| `sprites` | Les poses : nom de pose → liste d'images, jouées en boucle (au moins `idle`). |
| `fps` | Images par seconde de l'animation (8 par défaut). |
| `mouths` | Les images de bouche par pose ([ci-dessous](#speech-animation)). |
| `portrait` | Pour la carte, les appels et les menus de conversation. |
| `kind` | Ses sortes, pour les réactions par sorte (`['person']`, `['cat']` ; [réactions](create.reactions.md#fallbacks)). |
| `refuse` | La réponse à tout Donner sans règle. |
| `hug` | La réponse au sujet global « câlin » (`globalTalk.hug`) ; sans lui, « ♥ ». |
| `offscreen` | Parle dans un cadre en haut de l'écran, sans corps (narrateur, peluche, téléphone). |
| `glow` | Un halo doux autour du personnage (une couleur CSS), par exemple une apparition. |
| `room` | La salle de départ d'un personnage qui se déplace d'une salle à l'autre ([faire bouger les personnages](create.moving-characters.md)). |
| `variants`, `palette`, `paletteTolerance` | Des apparences qui dépendent de l'état ([ci-dessous](#variants)). |
| `description` | Son apparence, en mots, pour les prompts d'images (`npm run prompts`). Jamais affiché en jeu. |

Le héros est un personnage aussi (`hero` dans `game.ts`) ; plusieurs personnages jouables et le choix du héros sont
dans [héros](create.heroes.md). Un personnage ne parle dans une salle qu'à travers un acteur, sauf dans un appel
téléphonique ([commandes](create.commands.md#sequences)).

<a name="poses"></a>

## Poses

Par convention : `idle`, `talk`, `walk` (de profil, tourné vers la droite ; le moteur retourne l'image pour la
gauche), `walk_front`, `walk_back`, `point`, `use`, plus toute pose spéciale voulue (`sleep`, `sit`, `celebrate`…). Une
pose est une liste d'images jouées en boucle. Une pose manquante retombe sur `idle` (`validate` signale un acteur dont
la `pose` manque). Le `cast.ts` du modèle a des aides pour les planches standard : `human(id)` et `cat(id)` font
correspondre une planche de 6 × 4 à ces poses ([images](create.images.md)). `{ pose: ['cat', 'sleep'] }` pose une
pose durable ; `{ anim: ['hero', 'use'], ms: 600 }` en joue une un moment ([commandes](create.commands.md#movement)).

<a name="speech-animation"></a>

## Parole : seule la bouche bouge

Un personnage qui a une planche de parole déclare ses bouches par pose. Pendant une réplique, le corps ne change
jamais : les images de bouche ouverte tournent au hasard (de 160 à 220 ms), et un clignement passe de temps en temps
au repos. L'image « bouche fermée » remplace l'image de repos de la pose : repos et parole viennent du même dessin.

```ts
import { human, mouths } from './cast';
grandpa: { …, mouths: mouths('talk_grandpa', { idle: 'profile', front: 'face', seated: 'seated' }) },
```

`mouths(dossier, { pose: rangée })` lit `<dossier>/<rangée>/t1…t6` (t1 fermée, t2 à t4 ouvertes, t5 clignement, t6
sourire), les images que produit `tools/talk-apply.py`. Sans bouche pour une pose, le personnage garde la même image
et rebondit d'un pixel en parlant ; une longue réplique commence par un geste (la pose `talk`) joué une fois.

<a name="variants"></a>

## Variantes selon l'état

```ts
import { cat } from './cast';
hero: { …, sprites: cat('hero'), variants: [{ if: { has: 'bucket' }, sprites: cat('hero_bucket'), mouths: … }] },
```

La première variante dont la condition est vraie remplace `sprites`, `mouths` et `portrait`, et `name` quand elle en
a un (4.3.0 : le héros que le joueur a choisi, un personnage renommé après une révélation ; [héros](create.heroes.md)).
Le changement se voit tout de suite (par exemple dès que le seau est ramassé).

<a name="palette-swap"></a>

## Changement de palette (`palette`, aussi sur les variantes)

Une planche, plusieurs apparences : `palette` fait correspondre des couleurs sources à des couleurs cibles, toutes deux
en `#rrggbb`. La vue de la salle recolore une fois chaque image de pose et de bouche du personnage, dans un canvas hors
écran (mis en cache, transparence gardée). La `palette` d'une variante remplace celle du personnage tant que sa
condition tient (une variante sans palette garde celle du personnage).

```ts
biscuit: { …, sprites: cat('cat'),
  palette: { '#2c1818': '#7a3416', '#492a25': '#b0592a', '#543329': '#c4703a' }, paletteTolerance: 14,
  variants: [{ if: 'muddy', palette: { '#492a25': '#5a4a3a' } }] },
```

Par défaut, la correspondance est exacte au RGB près : cela convient au style `pixel`, dont le découpeur donne à
chaque matière une valeur exacte. Les planches peintes (`cel`) et le WebP avec perte ont beaucoup de tons voisins :
`paletteTolerance` (une distance RGB ; 10 à 16 est un bon début, sous la distance à la couleur du contour) recolore
chaque pixel proche d'une couleur source, en gardant son écart avec elle ; la couleur source la plus proche l'emporte.
Prenez les couleurs sources dans le PNG découpé (les couleurs opaques les plus fréquentes d'une case). Le Biscuit de
la démo s'en sert pour devenir un chat roux tigré.

> [!LIMIT id=portraits-not-recoloured]
> Les portraits des menus et des appels ne sont pas recolorés. `npm run validate` prévient d'une clé ou d'une valeur de
> palette qui n'est pas en `#rrggbb`.

<a name="multiple-states"></a>

## Choses à plusieurs états

Une mouette qui regarde ou gobe, un vieux chien qui dort, boude ou bâille, l'œil d'un chat qui brille sur un écran :
une zone cliquable n'a qu'un nom et une forme, donc pour une chose dessinée qui change, prenez un **accessoire à
états** :

```ts
props: { seagull: { name: 'mouette', states: { watch: 'obj_yard/r2c4', snap: 'obj_yard/r2c5' }, initial: 'watch' } }
```

avec une position par état dans le layout (`props.seagull.states.snap`) ; la zone cliquable suit l'image. Changez
l'état avec `{ prop: ['seagull', 'snap'] }` et réagissez-y avec `if: { prop: ['seagull', 'snap'] }`. Pour un morceau du
fond qui change de nom ou de forme, prenez deux zones cliquables aux conditions `visible` opposées (`visible: 'x'` /
`visible: '!x'`), chacune avec sa forme ; une règle peut viser les deux (`a: ['h1', 'h2']`).

<a name="presence"></a>

## Présence sans interaction

`actors: { ghost: { char: 'ghost', interactive: false, visible: 'ghost_seen' } }` : visible, mais ni cliquable ni
nommé. À combiner avec `{ show: 'ghost', fade: 1500 }` / `{ hide: 'ghost', fade: 1500 }` et `glow` sur la fiche du
personnage.

<a name="related"></a>

## Identifiants liés

- `CharacterDef`, `ActorDef`, `MouthSet` dans [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts).
- [Salles : acteurs](create.rooms.md#actors), [dialogues](create.dialogues.md), [héros](create.heroes.md),
  [images](create.images.md), [voix](create.voices.md).
