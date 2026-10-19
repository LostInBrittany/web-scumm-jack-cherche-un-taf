# Jack cherche un taf : brief pour générer toutes les images

Tu génères les images du jeu `games/jack/` (moteur web-scumm), en **pixel art** façon LucasArts années 90.
Le dépôt est à la racine `/Users/horacio/git/games/jack-cherche-un-taf`. Lance toutes les commandes depuis la racine.

## Les sources

- `games/jack/prompts.md` : **une consigne par planche, prête à coller**, générée par `npm run prompts`. Utilise ces
  blocs tels quels (ne réécris pas le style, la grille, les COLOR RULES ni les PIXEL RULES : c'est ce qui rend le jeu
  cohérent). Tu ajoutes seulement les précisions de la section « Compléments » ci-dessous.
- `games/jack/storyboard.json` : l'histoire, si tu veux comprendre qui est qui.
- `docs/en/PROMPTS.md` : le guide complet.

## Règles absolues

1. **Jack n'est pas un jouet.** Pas de briques, pas de plastique, pas de LEGO. C'est un squelette (des os) avec une
   citrouille d'Halloween sculptée en guise de tête.
2. **Aucun nom de marque** dans une consigne.
3. **Aucun texte dans les images** (enseignes, panneaux, écrans : vides).
4. **Fond plat magenta `#FF00FF`** sur toutes les planches (l'outil de découpe détecte la couleur du bord et
   l'enlève). Dans chaque consigne de `prompts.md`, remplace `#2B2E45` par `#FF00FF` : le bleu nuit d'origine se
   confond avec les vêtements noirs (le Comte est devenu invisible). Pas de fond plat pour les décors.
5. **Grille des pixels** : dans chaque consigne, remplace la phrase des PIXEL RULES « drawn on a 384 x 256 pixel grid
   (64 x 64 per 256 px cell), scaled up 4x … every art pixel is an exact 4 x 4 square » par « drawn on a 768 x 512
   pixel grid (128 x 128 per 256 px cell), scaled up 2x … every art pixel is an exact 2 x 2 square ». Pour les
   décors : « drawn on a 768 x 480 pixel grid, scaled up 2x ».
6. **Rien ne dépasse de sa case** : vérifie chaque planche avant de découper. Une tête qui déborde sur la case du
   dessus sera coupée : régénère plutôt.
7. Ne touche pas à `rooms/*.ts`, `layout/*.json`, `cast.ts`, `game.ts`. Seulement `art/` et `private/sheets/`.
8. Ne supprime jamais une image : renomme l'ancienne en `<nom>_v1.png`.

## Déjà fait

- **Jack** (`jack`) : validé, découpé. C'est `art/_reference.png`. Ne le refais pas.
- **Comte Radinoff** (`radinoff`) : **à refaire** sur fond magenta (sa cape et son costume noirs ont disparu avec le
  fond bleu nuit, et sa tête dépassait de certaines cases). Renomme d'abord `private/sheets/radinoff.png` en
  `radinoff_v1.png`.
- **Gloubi** (`gloubi`) : **à refaire** sur fond magenta. Sur le bleu nuit, ses yeux sombres sont partis avec le
  fond dans certaines cases. Renomme d'abord `private/sheets/gloubi.png` en `gloubi_v1.png`.

## Nettoyer le liseré magenta (après chaque découpe)

Le fond magenta laisse un liseré rose autour des personnages, et des taches dans les trous de la silhouette (entre
les jambes, entre un bras et le corps). Après chaque découpe :

```
python3 games/jack/art-tools/defringe.py games/jack/art/<planche>
```

Pour un personnage ou un objet qui a lui-même du rose ou du violet (Mémé Guimauve, Pépite, la barbe à papa rose),
ajoute `--safe` : seul le magenta franc est effacé, sinon ses ombres roses seraient trouées. Regarde le résultat
de près avant de passer à la suite. Les planches brutes vont dans `private/sheets/`, pas dans `art/` : déplace le contenu
de `art/sheets/` vers `private/sheets/` (sans écraser ce qui y est déjà).

## L'ordre

1. **Jack d'abord** (section « Base sheet `jack` »), sans pièce jointe. Enregistre l'image dans
   `games/jack/private/sheets/jack.png` **et** une copie dans `games/jack/art/_reference.png`. C'est la référence de
   style de tout le reste : si Jack n'est pas réussi, recommence avant de continuer.
2. **Les autres personnages**, dans l'ordre de la checklist de `prompts.md`. Joins `games/jack/art/_reference.png` à
   chaque consigne. Pour `maire_ok`, joins aussi `private/sheets/maire.png` ; pour `brigadier_lanterne`, joins
   `private/sheets/brigadier.png`.
3. **Les objets** : `items`, `props`, `minigame` (joins la référence).
4. **Les décors** : `manoir`, `place`, `foire`, puis la **carte** (consigne plus bas, absente de `prompts.md`).

Une planche par génération. Si ton outil garde un contexte, recommence une session neuve tous les 3 ou 4
personnages, en rejoignant toujours `_reference.png`.

## Découper

Pour chaque planche, prends la commande de la checklist de `prompts.md` **et ajoute `--scale 2`**, par exemple :

```
python3 tools/cut-sheet.py games/jack/private/sheets/radinoff.png radinoff --scale 2
python3 tools/cut-sheet.py games/jack/private/sheets/items.png items --grid 6x4 --cells r1c1,… --scale 2
```

`--scale 2` est obligatoire : avec la réduction par 4 par défaut, les contours fins disparaissent et les personnages
sont troués. Le mode pixel est automatique (`"artStyle": "pixel"` dans `site.json`). Les dossiers `art/<planche>/` contiennent
aujourd'hui des images **provisoires** : la découpe les écrase, c'est voulu (les originaux restent dans `art/ph/`).
Pour les objets, fais les renommages listés dans la checklist (`r1c1.png → badge.png`, etc.).

**Saute** : les « Mouth kit » (`talk-kit.py`, `talk-apply.py`) et `starter/ui`. On n'en a pas besoin pour l'instant.

**Décors** : n'enregistre **pas** l'image générée directement dans `art/decor/`. Garde-la dans
`private/sheets/decor_<nom>.png`, puis réduis-la à la taille de l'écran du jeu :

```
python3 games/jack/art-tools/reduce-bg.py games/jack/private/sheets/decor_manoir.png manoir
```

Le script écrit `art/decor/manoir.png` (640 × 400) et renomme lui-même l'ancien en `_v1`. Les trois lieux tiennent
chacun sur **un seul écran** (format 16:10), la place du village comprise.

## Compléments : ce que `prompts.md` ne dit pas

### Personnages

- **Gloubi** (`gloubi`) : énorme blob vert sans jambes. Les lignes « walk » sont des glissements et rebonds de
  gelée ; les poses « back » le montrent de dos (le gilet orange de dos).
- **Brigadier Sans-Tête** (`brigadier`) : **ne dessine jamais de tête**, ni dans les portraits (rangée 1 : le col
  de l'armure vide, vu de face, avec le képi tenu à la main). `brigadier_lanterne` : le même chevalier, avec une
  lanterne allumée posée sur le col comme une tête, qui éclaire en orange.
- **Le Maire** (`maire`) : sa tête **penche nettement sur le côté** (il lui manque un boulon du cou, un seul
  boulon visible). `maire_ok` : le même, la tête bien droite, les deux boulons en place, l'air ravi.
- **Mireille** n'a pas de planche : c'est seulement une icône d'objet (voir `items`).

### Objets `items` (icônes d'inventaire)

Ajoute ces descriptions aux cellules correspondantes des lignes `ROW` :

| image | à dessiner |
| --- | --- |
| `badge` | badge doré en forme d'écusson, petite citrouille gravée au centre, sans texte |
| `barbe` | barbe à papa rose sur un bâton en bois |
| `boulon` | gros boulon d'acier hexagonal avec son écrou (un boulon de cou de monstre) |
| `chaussette` | chaussette verte gluante qui goutte |
| `lanterne` | vieille lanterne en fer forgé, lueur orange chaude |
| `lettre` | lettre pliée avec un cachet de cire rouge |
| `mireille` | toute petite araignée ronde et noire, grands yeux blancs, nœud rose, souriante |
| `nez` | nez de clown rouge en mousse, brillant |
| `photo` | photo d'identité de Jack (tête de citrouille) qui porte un nez de clown rouge et sourit, bord blanc |
| `photo_ratee` | la même photo d'identité, mais terrifiante : sourire de Jack flamboyant, fumée, photo fendue |

### Objets `props` (posés dans les décors)

| image | à dessiner |
| --- | --- |
| `casier_ferme` | grand casier de vestiaire en métal gris-vert cabossé, fermé, avec aérations |
| `casier_ouvert` | le même casier, porte ouverte, vide à l'intérieur |
| `pepite_peur` | Pépite, petit bébé dragon violet tout rond, piques jaunes sur le dos, assis ; il tremble, yeux écarquillés, bouche ondulée |
| `pepite_calme` | le même Pépite, apaisé : yeux fermés, joues roses, petit sourire |
| `photomaton` | cabine photomaton à l'ancienne, caisson bleu-vert, rideau rouge à moitié ouvert, lampe dessus, sans texte |
| `tas` | petit tas de bric-à-brac recraché par un blob : parapluie noir, vélo d'enfant rouge, dentier, un peu de gelée verte |

### Objets `minigame`

| image | à dessiner |
| --- | --- |
| `barbe_rose`, `barbe_bleue`, `barbe_verte`, `barbe_jaune` | une grosse barbe à papa sur bâton, **exactement la même forme** sur les quatre, seule la couleur change |
| `barbe_araignee` | même forme, mais faite de toile d'araignée grise, avec une petite araignée dedans |
| `main` | une main de squelette (os ivoire), paume ouverte, vue de dessus |
| `pepite_big` | grand gros plan de Pépite (même dragon que dans `props`), apeuré, recroquevillé |

### La carte du village (`decor/carte`)

Absente de `prompts.md`. Prends le bloc STYLE des décors (section « Background » de `prompts.md`), avec
`_reference.png` joint, et remplace COMPOSITION / LOCATION / EMPTY SPOTS par :

```
FORMAT: 1536 x 960 pixels (16:10).
A hand-drawn treasure-map style map of a small Halloween village, seen from above, on old parchment.
Top left: a haunted manor on a hill. Center: the village square with small houses and the town hall. Right: a small
funfair with a carousel and a Ferris wheel. Dirt roads connect the manor to the square and the square to the funfair.
A few pine trees, pumpkins along the roads. No people, no text, no labels.
```

Enregistre-la en `private/sheets/decor_carte.png`, puis
`python3 games/jack/art-tools/reduce-bg.py games/jack/private/sheets/decor_carte.png carte`.

## Vérifier à la fin

```
npm run assets
npm run validate
npm run solve
npm run audit
```

Les trois premières doivent finir sur ✔. Puis regarde chaque lieu : `npm run dev`, ouvre
`http://localhost:5173/?dev&at=manoir` (puis `at=place`, `at=foire`) et fais une capture. Les zones cliquables des
décors seront à replacer ensuite (ça, c'est l'autre agent qui s'en charge avec l'éditeur) : signale-le simplement.

Termine par un court compte rendu : les planches faites, celles qui ont posé problème, ce qui reste.
