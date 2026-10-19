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
4. **Le fond des planches** (personnages, objets, mini-jeux ; pas les décors) : voir « Choisir le fond » plus bas.
   D'abord un **fond transparent**, si ton outil sait le faire. Sinon, un fond plat de la couleur la plus éloignée
   des couleurs du dessin, choisie avec `pick-bg.py`. Le bleu nuit `#2B2E45` d'origine est interdit (il se confond
   avec les vêtements noirs). Le magenta n'est plus systématique : il mange les ombres roses ou violettes.
5. **Grille des pixels** : dans chaque consigne, remplace la phrase des PIXEL RULES « drawn on a 384 x 256 pixel grid
   (64 x 64 per 256 px cell), scaled up 4x … every art pixel is an exact 4 x 4 square » par « drawn on a 768 x 512
   pixel grid (128 x 128 per 256 px cell), scaled up 2x … every art pixel is an exact 2 x 2 square ». Pour les
   décors : « drawn on a 768 x 480 pixel grid, scaled up 2x ».
6. **Rien ne dépasse de sa case** : vérifie chaque planche avant de découper. Une tête qui déborde sur la case du
   dessus sera coupée : régénère plutôt.
7. Ne touche pas à `rooms/*.ts`, `layout/*.json`, `cast.ts`, `game.ts`. Seulement `art/` et `art/sheets/`.
8. Ne supprime jamais une image : renomme l'ancienne en `<nom>_v1.png`. Les dossiers et fichiers `_v1`, `_v2`… et
   `_rejected/` servent pendant la retouche : ne les supprime pas toi-même. Une fois la nouvelle version validée et
   commitée, on peut les supprimer (git les garde dans son historique).

## Déjà fait

- **Jack** (`jack`) : **à refaire** sur fond magenta, voir « Refaire Jack » juste en dessous. Sa planche actuelle
  (fond bleu nuit) reste la référence de style : `art/_reference.png` **ne change pas**.
- **Comte Radinoff** (`radinoff`) : **à refaire** sur fond magenta (sa cape et son costume noirs ont disparu avec le
  fond bleu nuit, et sa tête dépassait de certaines cases). Renomme d'abord `art/sheets/radinoff.png` en
  `radinoff_v1.png`.
- **Gloubi** (`gloubi`) : **à refaire** sur fond magenta. Sur le bleu nuit, ses yeux sombres sont partis avec le
  fond dans certaines cases. Renomme d'abord `art/sheets/gloubi.png` en `gloubi_v1.png`.

## Choisir le fond

**1. Teste la transparence, une seule fois.** Avec ton outil d'images, génère une petite image de test : une
citrouille orange sur fond transparent. Enregistre-la dans `games/jack/private/test-alpha.png`, puis :

```
python3 games/jack/art-tools/check-alpha.py games/jack/private/test-alpha.png
```

- `TRANSPARENT` : génère toutes les planches sur fond transparent. Dans la consigne, remplace la ligne
  `BACKGROUND: …` par :

  ```text
  BACKGROUND: fully transparent (alpha 0) over the whole canvas, saved as a PNG with an alpha channel. Never paint
  a checkerboard, a colour or a texture to show the transparency. Every pixel of a figure is fully opaque, including
  the inside of carved or open shapes (mouths, eyes): only the space around and between the figures is transparent.
  ```

  Après la découpe, pas besoin de `defringe.py`.
- `FAKE CHECKERBOARD` ou `OPAQUE` : ton outil ne sait pas faire de vraie transparence. Passe au point 2.

**2. Sinon, la couleur la plus éloignée.** Avant chaque planche, donne à `pick-bg.py` ce que tu as du personnage :
sa planche actuelle, ses images découpées, ou la référence qu'il doit suivre.

```
python3 games/jack/art-tools/pick-bg.py games/jack/art/sheets/<planche>.png
```

Il affiche `BEST #……`. Mets cette couleur dans la ligne `BACKGROUND: one single flat uniform color #…` de la
consigne, et après la découpe, nettoie le liseré avec la même couleur :

```
python3 games/jack/art-tools/defringe.py games/jack/art/<planche> --bg '#00FFFF'
```

(Pour Jack, c'est le cyan `#00FFFF` : sa citrouille orange a des ombres roses que le magenta efface.)

## Refaire Jack

La planche magenta (deuxième version) est bien dessinée, mais le nettoyage du liseré a troué la citrouille : ses
ombres rose-violet ressemblent trop au magenta. La première version (fond bleu nuit) avait une tige qui flottait et
des bouches de profil de la couleur du fond.

1. Renomme `art/sheets/jack.png` en `art/sheets/jack_v2.png`, et le dossier `art/jack/` en `art/jack_v2/`. Ne
   touche ni à `art/_reference.png`, ni à `jack_v1`.
2. Fond : transparent si le test le permet, sinon cyan `#00FFFF` (voir « Choisir le fond »).
3. Prends la consigne « Base sheet `jack` » de `prompts.md`, mets-y le fond choisi, et **joins
   `art/sheets/jack_v2.png`** : c'est ce Jack-là qu'il faut refaire à l'identique (mêmes poses, mêmes couleurs, tige
   bien plantée), seul le fond change. Ajoute à la fin de la consigne :

   ```text
   PUMPKIN DETAILS — strict, on every cell:
   - The curly green stem is firmly attached to the top of the pumpkin: its base sits inside the pumpkin's top
     outline, with no gap and no background pixel between the stem and the pumpkin.
   - The carved eyes and mouth are always filled: warm yellow glow, or the dark warm brown of the outline for the
     deepest parts. Never leave a carved opening in the background colour or transparent, also in profile,
     three-quarter and back views.
   - The pumpkin and the stem have the same clean dark one-pixel outline as the rest of the figure.
   ```
4. Enregistre l'image dans `art/sheets/jack.png`. Avant de découper, zoome sur chaque case : la tige touche la
   citrouille, aucune bouche ni aucun œil n'est transparent ou de la couleur du fond, rien ne dépasse de sa case.
   Sinon, régénère.
5. Découpe avec **64 couleurs** (à 32, le vert de la tige devient beige) :

   ```
   python3 tools/cut-sheet.py games/jack/art/sheets/jack.png jack --scale 2 --colors 64
   ```

   Fond cyan seulement : `python3 games/jack/art-tools/defringe.py games/jack/art/jack --bg '#00FFFF'`.
6. Vérifie les 24 images de `art/jack/` sur un fond vert vif : pas de trou entre la tige et la citrouille, pas de
   trou dans la tête ni sur le bord de la citrouille, pas de liseré. Puis `npm run assets`.

**Fait** : Jack a été refait sur fond transparent (`art/sheets/jack.png`), c'est validé.

## Passe 3 : refaire toutes les autres planches sur fond transparent

Le test de « Choisir le fond » a donné `TRANSPARENT` : toutes les planches se font maintenant sur fond transparent.
On refait les autres avec cette technique, pour en finir avec les liserés roses et les trous laissés par le
nettoyage du magenta. Tout est commité : remplace directement les planches et les images, git garde les anciennes
versions (pas besoin de `_v1` pour cette passe).

**Le principe : même dessin, autre fond.** Pour chaque planche, prends sa consigne dans `prompts.md` (ou
`prompts-episode2.md`), remplace la ligne `BACKGROUND: …` par la ligne transparente de « Choisir le fond », ajoute
les « Compléments » plus bas s'il y en a, et **joins la planche actuelle** `art/sheets/<planche>.png` avec cette
phrase à la fin de la consigne :

```text
REDRAW: redraw the attached sheet exactly: same character or objects, same cells in the same positions, same poses,
same colours, same proportions, same size in each cell. Only the background changes: fully transparent. Every
figure stays fully opaque inside, including holes, openings, eyes and mouths.
```

Joins aussi `art/_reference.png`, comme d'habitude. Une seule exception au « même dessin » : le Maire (plus bas).

**L'ordre** (une planche par génération, une session neuve tous les 3 ou 4 planches) :

1. Personnages : `radinoff`, `bandelette`, `maire` (voir plus bas), puis `maire_ok` (joins le **nouveau**
   `maire.png`), `gloubi`, `brigadier`, puis `brigadier_lanterne` (joins le nouveau `brigadier.png`), `guimauve`,
   `carrousel`, `wolfgang`, `ginette`, `bouh`.
2. Objets : `items`, `props`, `minigame`, `items_ep2`, `props_ep2`, `minigame_ep2`.
3. Pas les décors (`decor_*`, `cache_fond`) : ils n'ont pas de fond à enlever.

**Pour chaque planche :**

1. Vérifie l'image : `python3 games/jack/art-tools/check-alpha.py games/jack/art/sheets/<planche>.png` doit dire
   `TRANSPARENT`. Zoome sur chaque case : rien de transparent à l'intérieur d'une figure (yeux, bouches, boutons,
   trous de serrure), rien ne dépasse de sa case. Sinon, régénère.
2. Découpe avec la commande de la checklist de `prompts.md`, en ajoutant **`--scale 2 --colors 64`** :

   ```
   python3 tools/cut-sheet.py games/jack/art/sheets/radinoff.png radinoff --scale 2 --colors 64
   ```

   Pour les objets, garde exactement les mêmes `--grid` et `--cells` qu'avant, et refais les mêmes renommages
   (`r1c1.png → badge.png`, etc.) : chaque fichier de `art/items/`, `art/props/`, `art/minigame/` doit être remplacé
   par une image du même nom. Note la liste des fichiers avant de découper, et compare après.
3. **Pas de `defringe.py`** : sans fond coloré, il n'y a pas de liseré.
4. Regarde les images découpées sur un fond vert vif : pas de trou, pas de morceau manquant, pas de reste de fond.

### Le Maire : la tête bien plus penchée

Aujourd'hui, sa tête ne penche qu'un peu, et seulement sur les portraits : en marchant ou de dos, elle est presque
droite. On ne voit pas qu'il lui manque un boulon. Pour `maire`, ajoute à la consigne (en plus de REDRAW) :

```text
MISSING BOLT — strict, on every cell: the mayor has lost one of his two neck bolts. The side without the bolt shows
an empty round hole, and his head hangs heavily toward that side (the viewer's right), tilted about 30 degrees, as
if it could fall off at any moment. Only the bolt on the other side remains. The tilt is the same, clearly visible,
in every cell: portraits, walk cycle, front, back and profile views, gestures. Never draw the head upright. His face
stays cheerful and a bit embarrassed. Everything else (suit, sash, tie, colours, proportions, poses) stays exactly
as in the attached sheet.
```

Puis `maire_ok`, avec le nouveau `maire.png` joint : le même Maire, la tête **bien droite**, les **deux** boulons en
place, l'air ravi.

Vérifie en jeu : `?dev&at=place` (le Maire penché), puis le Maire après avoir rendu le boulon (`maire_ok`).

### À la fin de la passe

```
npm run assets
npm run validate
npm run solve
```

Puis des captures de chaque lieu (`?dev&at=manoir`, `place`, `foire`, `train`), et un court compte rendu : les
planches faites, celles qui ont posé problème, les fichiers qui manqueraient.

## Nettoyer le liseré magenta (planches déjà faites sur fond magenta)

Le fond magenta laisse un liseré rose autour des personnages, et des taches dans les trous de la silhouette (entre
les jambes, entre un bras et le corps). Après chaque découpe :

```
python3 games/jack/art-tools/defringe.py games/jack/art/<planche>
```

Pour un personnage ou un objet qui a lui-même du rose ou du violet (Mémé Guimauve, Pépite, la barbe à papa rose),
ajoute `--safe` : seul le magenta franc est effacé, sinon ses ombres roses seraient trouées. Regarde le résultat
de près avant de passer à la suite. Les planches brutes vont dans `art/sheets/` : elles sont gardées dans git, c'est
la source de tous les dessins. Une planche refaite : renomme d'abord l'ancienne en `<nom>_v1.png`.

## L'ordre

1. **Jack d'abord** (section « Base sheet `jack` »), sans pièce jointe. Enregistre l'image dans
   `games/jack/art/sheets/jack.png` **et** une copie dans `games/jack/art/_reference.png`. C'est la référence de
   style de tout le reste : si Jack n'est pas réussi, recommence avant de continuer.
2. **Les autres personnages**, dans l'ordre de la checklist de `prompts.md`. Joins `games/jack/art/_reference.png` à
   chaque consigne. Pour `maire_ok`, joins aussi `art/sheets/maire.png` ; pour `brigadier_lanterne`, joins
   `art/sheets/brigadier.png`.
3. **Les objets** : `items`, `props`, `minigame` (joins la référence).
4. **Les décors** : `manoir`, `place`, `foire`, puis la **carte** (consigne plus bas, absente de `prompts.md`).

Une planche par génération. Si ton outil garde un contexte, recommence une session neuve tous les 3 ou 4
personnages, en rejoignant toujours `_reference.png`.

## Découper

Pour chaque planche, prends la commande de la checklist de `prompts.md` **et ajoute `--scale 2`**, par exemple :

```
python3 tools/cut-sheet.py games/jack/art/sheets/radinoff.png radinoff --scale 2
python3 tools/cut-sheet.py games/jack/art/sheets/items.png items --grid 6x4 --cells r1c1,… --scale 2
```

`--scale 2` est obligatoire : avec la réduction par 4 par défaut, les contours fins disparaissent et les personnages
sont troués. Le mode pixel est automatique (`"artStyle": "pixel"` dans `site.json`). Les dossiers `art/<planche>/` contiennent
aujourd'hui des images **provisoires** : la découpe les écrase, c'est voulu (les originaux restent dans `art/ph/`).
Pour les objets, fais les renommages listés dans la checklist (`r1c1.png → badge.png`, etc.).

**Saute** : les « Mouth kit » (`talk-kit.py`, `talk-apply.py`) et `starter/ui`. On n'en a pas besoin pour l'instant.

**Décors** : n'enregistre **pas** l'image générée directement dans `art/decor/`. Garde-la dans
`art/sheets/decor_<nom>.png`, puis réduis-la à la taille de l'écran du jeu :

```
python3 games/jack/art-tools/reduce-bg.py games/jack/art/sheets/decor_manoir.png manoir
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

Enregistre-la en `art/sheets/decor_carte.png`, puis
`python3 games/jack/art-tools/reduce-bg.py games/jack/art/sheets/decor_carte.png carte`.

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

---

# Épisode 2 : le train fantôme

Les consignes des **26 nouvelles images** sont dans `games/jack/prompts-episode2.md` (même style, même bloc de
couleurs). Toutes les règles ci-dessus restent valables : fond choisi comme dans « Choisir le fond » (ces planches-là ont été
faites sur magenta `#FF00FF`), grille **2x**
(« 768 x 512 pixel grid, 128 x 128 per cell »), découpe avec **`--scale 2`**, **nettoyage du liseré** avec
`defringe.py` après chaque découpe, `art/_reference.png` (Jack) joint à chaque consigne.

Les dossiers concernés contiennent déjà des images **provisoires** : la découpe les remplace, c'est voulu.

## Ne pas écraser les planches de l'épisode 1

Dans `art/sheets/`, les noms `items.png`, `props.png` et `minigame.png` sont déjà pris par l'épisode 1. Enregistre
les nouvelles planches sous `items_ep2.png`, `props_ep2.png`, `minigame_ep2.png`, et adapte le chemin des
commandes de la checklist (le deuxième argument, le dossier de sortie, reste `items`, `props`, `minigame`).

## L'ordre

1. `ginette`, puis `bouh` (personnages). Saute les « Mouth kit ».
2. `items_ep2`, `props_ep2`, `minigame_ep2` (objets).
3. Le décor `decor/train` : enregistre-le en `art/sheets/decor_train.png`, puis
   `python3 games/jack/art-tools/reduce-bg.py games/jack/art/sheets/decor_train.png train`.
4. Le fond du cache-cache (`minigame/cache_fond`) : **ce n'est pas un objet** mais une image plein écran. Retire
   sa case de la planche `minigame_ep2` (laisse-la vide) et génère-le à part, comme un décor (consigne plus bas), puis
   `python3 games/jack/art-tools/reduce-bg.py games/jack/art/sheets/cache_fond.png cache_fond --dir minigame`.

## Compléments

### Personnages

- **Ginette** : un fantôme en drap, bien en chair, nœud rouge sur la tête, déléguée syndicale (poing levé dans
  certaines poses). **Pas de jambes** : les lignes « walk » sont des glissements flottants, le bas du drap ondule.
- **Bouh** : un tout petit fantôme timide (environ deux fois plus petit que Ginette **dans le jeu**, mais dessine-le
  à la même taille de case : le moteur le réduit). Pas de jambes non plus.
- Ginette, Bouh et Gaston doivent avoir **le même drap blanc** (mêmes tons), pour qu'on voie qu'ils sont collègues.

### Objets `items_ep2`

| image | à dessiner |
| --- | --- |
| `fiche_poste` | une feuille d'offre d'emploi, quelques lignes grises sans texte lisible, un tampon citrouille orange en haut, un cachet de cire rouge en bas |
| `bandelettes` | un gros rouleau de bandelettes de momie en lin beige, avec un bout qui pend |
| `chaine` | une chaîne de vélo légère et brillante, enroulée, encore un peu de gelée verte dessus |

### Objets `props_ep2`

| image | à dessiner |
| --- | --- |
| `fantomes_greve` | Gaston, fantôme en drap troué, l'air bougon, de grosses chaînes en fer aux poignets, tenant une banderole de grève **sans texte** (un poing levé dessiné dessus) |
| `fantomes_travail` | le même Gaston, souriant, enroulé dans des bandelettes neuves, une fine chaîne de vélo à la place des grosses chaînes, sans banderole |
| `tableau_eteint` | vieux tableau électrique mural, porte ouverte, un nœud de fils rouge, bleu, vert, jaune, voyants éteints |
| `tableau_allume` | le même tableau, fils bien rangés, voyants allumés, une petite étincelle |
| `panneau_vide` | un panneau d'affichage en bois sur deux pieds, vide |
| `panneau_affiche` | le même panneau avec un poster géant terrifiant : le portrait de Jack, citrouille flamboyante, sourire effrayant, fumée |

### Objets `minigame_ep2`

| image | à dessiner |
| --- | --- |
| `cables_board` | un panneau gris **vertical**, environ 1 de large pour 2,5 de haut, avec 4 prises rondes l'une sous l'autre |
| `cables_noeud` | un gros nœud emmêlé de câbles rouge, bleu, vert et jaune |
| `prise_rouge`, `prise_bleu`, `prise_vert`, `prise_jaune` | **la même** fiche électrique pointée vers la droite, seule la couleur change |
| `squelette_calme` | un squelette de décoration de train fantôme, suspendu, immobile |
| `squelette_danse` | le même squelette qui danse comme un fou, bras en l'air |
| `cache_cercueil` | un cercueil debout, fermé (du train fantôme, un peu en carton) |
| `cache_cercueil_jack` | le même cercueil, couvercle ouvert, Jack qui surgit bras en l'air (« BOUH ! ») |
| `cache_lustre` | un lustre poussiéreux suspendu, plein de toiles d'araignée |
| `cache_armoire` | une vieille armoire grinçante à deux portes |
| `cache_tonneau` | un tonneau en bois cerclé de fer |

### Le fond du cache-cache (`cache_fond`)

Bloc STYLE des décors de `prompts-episode2.md`, `_reference.png` joint, et :

```
FORMAT: 1536 x 960 pixels (16:10).
Inside a funfair ghost train tunnel, dark and spooky but funny. Rails across the lower part of the image. In the
middle, a small red wagon seen from the side, with three passengers seen from behind: a headless knight in armour with
a glowing lantern on his neck, a green Frankenstein-like mayor in a dark suit, and a big round green slime blob. Keep
the left side, the top centre and the right side empty: the game places a coffin, a chandelier, a wardrobe and a
barrel there. No text.
```

## Vérifier à la fin

Comme pour l'épisode 1 : `npm run assets`, `npm run validate`, `npm run solve`, puis regarder
`http://localhost:5173/?dev&at=train` et `?dev&at=repetition`. Signale-moi que c'est fini : je replacerai les zones
cliquables du train sur le nouveau décor.
