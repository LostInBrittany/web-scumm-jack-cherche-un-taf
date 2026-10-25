# Outils pour les images

Les outils qui transforment des planches générées ou dessinées en images de jeu sont des scripts Python que le moteur
livre sous `tools/` : ils découpent une planche en sprites, choisissent son fond, et préparent pour le navigateur
chaque image qu'un jeu cite. Cette page les installe et lance chacun une fois, dans le dépôt du moteur et dans un projet
créé. À quoi doivent ressembler les images, et comment s'écrivent les prompts : voir [Images](create.images.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Python et ses modules épinglés installés, une planche découpée en sprites détourés sous le dossier `art/` de votre jeu,
et ces sprites préparés dans `public/assets/` par `npm run assets`.

<a name="context-and-versions"></a>

## Contexte et versions

- Le **dépôt du moteur** (un jeu sous `games/<id>/`) ou un **projet créé** (le jeu sous `game/`, les outils sous
  `node_modules/@quest-n-click/engine/tools/`). Les commandes ne diffèrent que par le chemin de l'outil et de sa sortie.
- Depuis la 4.3.0, les modules sont Pillow 13.0.0, NumPy 2.4.6 et SciPy 1.18.1 (`requirements.txt`) ; avec ce passage,
  les images du jeu d'exemple sont sorties identiques octet pour octet ([notes 4.3](install.upgrade-notes-4-3.md)).

<a name="prerequisites"></a>

## Prérequis

- Python 3 ([Prérequis](install.requirements.md#python)) ; la CI utilise la 3.12.
- Un jeu, avec son `site.json` (le modèle en a un).
- Pour les sons et les vidéos de `npm run assets` : ffmpeg ([Prérequis](install.requirements.md#ffmpeg)).

<a name="where-to-run"></a>

## Où lancer les commandes

À la racine du dépôt du moteur, ou à la racine du projet créé. Chaque bloc dit lequel.

<a name="steps"></a>

## Étapes

<!-- step: python-modules -->
1. Installez les modules épinglés :

   ```sh
   # dans le dépôt du moteur
   python3 -m pip install --require-hashes -r requirements.txt
   ```

   ```sh
   # dans un projet créé
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   ```

<!-- step: prompts -->
2. Obtenez un prompt prêt à coller par planche que cite le jeu, avec la commande de découpe de chacune (`--missing`
   pour les planches pas encore découpées). Il écrit `prompts.md` dans le dossier du jeu :

   ```sh
   # dans le dépôt du moteur : games/<id>/prompts.md
   npm run prompts
   ```

   ```sh
   # dans un projet créé : game/prompts.md
   npx quest-n-click prompts
   ```

<!-- step: cut-sheet -->
3. Découpez une planche générée en sprites détourés, `<sortie>/<id-planche>/r<ligne>c<colonne>.png` (une grille 6 × 4
   par défaut, `--grid` pour la changer, `--auto` pour des figures hors grille) :

   ```sh
   # dans le dépôt du moteur : écrit games/<GAME>/art/hero/
   python3 tools/cut-sheet.py hero_sheet.png hero
   ```

   ```sh
   # dans un projet créé : nommez le dossier de sortie, celui par défaut est games/<GAME>/art du dépôt
   python3 node_modules/@quest-n-click/engine/tools/cut-sheet.py hero_sheet.png hero --out game/art
   ```

   Avec `"artStyle": "pixel"` dans `site.json` (ou `--pixel`), l'outil réduit aussi chaque case par 4 (`--scale`), la
   limite à 32 couleurs exactes (`--colors`) et écrit des PNG indexés ; `npm run assets` écrit ensuite du WebP sans
   perte. Une planche sur fond transparent (`"sheetBackground": "transparent"`) est découpée sur sa transparence, sans
   détourage par couleur.

<!-- step: choose-background -->
4. Choisissez le fond des planches, une fois par outil de génération d'images :

   ```sh
   # dans le dépôt du moteur (dans un projet créé, préfixez l'outil par node_modules/@quest-n-click/engine/)
   python3 tools/check-alpha.py test_image.png
   python3 tools/pick-bg.py games/<id>/art/hero/
   ```

   `check-alpha.py` dit si un outil d'images écrit une vraie transparence : `TRANSPARENT`, `FAKE CHECKERBOARD` ou
   `OPAQUE`. `pick-bg.py` prend des planches, des dossiers de sprites ou des images de référence et classe les couleurs
   unies selon leur distance au dessin ; sa première ligne, `BEST #RRGGBB`, est le `sheetBackground` à prendre.

<!-- step: assets -->
5. Préparez chaque image et chaque son que cite le contenu :

   ```sh
   # dans le dépôt du moteur, pour le jeu courant
   npm run assets
   ```

   ```sh
   # dans un projet créé
   npm run assets
   ```

   `tools/refs.ts` liste ce que cite le contenu (lieux, personnages, objets, la carte, les paramètres des mini-jeux,
   `skin`, les écrans de titre et de crédits, `ending.scratch`, et les `extraImages` d'`index.ts`), puis
   `tools/assets.py` le prépare dans `public/assets/`. Seul ce qui a changé est retraité. D'où chaque image est lue, et
   `sources.json` pour la lire ailleurs : voir [Images](create.images.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Après l'étape 3, le dossier de la planche sous `art/` contient un PNG par case. Après l'étape 5,
`public/assets/img/<planche>/<case>.webp` existe pour chaque image que cite le contenu, et `assets` affiche un
avertissement pour chacune qu'il n'a pas trouvée : `warning: missing images: …` (et `warning: missing sounds: …`).
Aucun avertissement : chaque image citée a été préparée.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `ModuleNotFoundError: No module named 'PIL'` (ou `numpy`, `scipy`) | Étape 1 pas faite, ou faite pour un autre Python | L'étape 1 avec le `python3` qui lance les outils ; dans un projet créé, `PYTHON=<chemin>` fait prendre un autre interpréteur à `assets` |
| `ModuleNotFoundError: No module named 'cv2'` | Un outil de bouches qui parlent demande OpenCV, absent de `requirements.txt` | Installez vous-même le module Python d'OpenCV |
| Les sprites arrivent dans un `games/<id>/art` d'un dossier qui n'existe pas | `cut-sheet.py` lancé dans un projet créé sans `--out` | Ajoutez `--out game/art` |
| `warning: missing images: …` | Le contenu cite une image sans fichier | Découpez-la ou ajoutez-la, ou corrigez le nom dans le contenu |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `prompts.md` dans le dossier du jeu (étape 2).
- `art/<id-planche>/` dans le dossier du jeu (étape 3) ; `--cells r1c2,r3c1` ne redécoupe que ces cases.
- `public/assets/` (pas commité), le `assets.gen.json` du jeu (les tailles en pixels des images préparées) et
  `.cache/refs.json` (étape 5).

<a name="recovery"></a>

## Reprise ou retour arrière

Commitez le dossier `art/` du jeu avant de redécouper une planche : l'outil écrase les cases qu'il écrit.
`public/assets/` se reconstruit à tout moment depuis les sources avec `npm run assets`.

<a name="talking-mouths"></a>

## Les outils de bouches qui parlent

`tools/talk-kit.py` prépare un « kit de parole » par personnage et par pose (la tête du sprite validé copiée dans une
grille 3 × 2), `tools/talk-apply.py` recolle les bouches générées sur le sprite, et `tools/talk-normalize.py` accorde une
rangée d'une planche de parole au sprite validé. Les deux derniers importent OpenCV (`cv2`).

> [!LIMIT id=talk-tools-repository-layout]
> `talk-kit.py` et `talk-apply.py` lisent et écrivent `games/<GAME>/…` depuis le dossier courant
> (`games/<id>/talk-kits.json`, `games/<id>/private/talk_kits/`) : ils ne marchent que dans l'organisation du dépôt du
> moteur, pas dans un projet créé. `talk-normalize.py` prend tous ses chemins en arguments et marche partout.

<a name="references"></a>

## Références

- [Images](create.images.md) (le pipeline, `sources.json`, le style graphique), [Bruitages](create.sound-effects.md)
- [Prérequis](install.requirements.md#python), [Outils audio](install.audio-toolchain.md)
- [`tools/cut-sheet.py`](../../tools/cut-sheet.py), [`tools/assets.py`](../../tools/assets.py),
  [`tools/check-alpha.py`](../../tools/check-alpha.py), [`tools/pick-bg.py`](../../tools/pick-bg.py),
  [`requirements.txt`](../../requirements.txt)
