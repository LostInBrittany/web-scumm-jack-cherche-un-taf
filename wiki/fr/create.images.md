# Images : prompts, découpe des planches, transparence, échelle

Les images d’un jeu se génèrent en planches (une grille de figures sur un fond uni ou transparent), se découpent en un
fichier par case, puis se préparent pour le navigateur. Cette page mène d’une description de personnage à une image
affichée par le jeu, et dit quoi faire quand une nouvelle image n’apparaît pas. Elle sert aussi de référence : comment
une image est nommée, les modèles de prompts, et les règles qui gardent les images cohérentes.

<a name="what-you-get"></a>

## Ce que vous obtenez

Chaque image nommée par le jeu existe en PNG découpé dans le dossier `art/` du jeu et en WebP préparé dans
`public/assets/img/`, avec sa taille en pixels dans `assets.gen.json`. `validate` ne signale aucune image manquante,
et le jeu affiche la nouvelle image après un rechargement.

<a name="context-and-versions"></a>

## Contexte et versions

Les deux contextes, avec des noms de commande différents :

- **Dépôt du moteur** : le jeu est `games/<id>/` ; les commandes sont des scripts npm (`npm run prompts`,
  `npm run assets`) et les outils Python de `tools/`.
- **Projet créé** (avec `quest-n-click create`) : le jeu est `game/` ; les commandes passent par la commande du moteur,
  `npx quest-n-click prompts` et `npm run assets` ; les outils Python sont dans `node_modules/@quest-n-click/engine/tools/`.

Ce que dit cette page est vrai à partir de 4.2.5 (le nom de commande `quest-n-click` ; le choix du fond des planches
date de 4.2.4). L’onglet **Assets** du Studio fait la même découpe depuis le navigateur : voir
[Assets et découpe dans le Studio](studio.assets.md).

<a name="prerequisites"></a>

## Prérequis

- Python 3 avec Pillow, NumPy et SciPy (`requirements.txt`) : voir [Outils d’image](install.image-toolchain.md).
  `npm run assets` a besoin de Pillow ; le découpeur, des trois.
- Un modèle d’image qui accepte une image de référence jointe. Ces prompts ont été écrits pour la génération d’images
  de ChatGPT.
- Le contenu du jeu écrit : les lieux, les personnages et les objets nomment d’abord leurs images (les prompts en sont
  tirés).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, à la racine du dépôt du moteur ou du projet créé. Chaque bloc ci-dessous dit lequel.

<a name="steps"></a>

## Étapes

<a name="generate-the-art"></a>

### Générer les images

<!-- step: describe -->
1. **Décrire ce que les prompts ne devinent pas.** Trois champs facultatifs nourrissent les prompts sans rien changer
   au jeu : `description` sur un personnage (la ligne CHARACTER : âge, cheveux, lunettes, silhouette, tenue, accessoire
   fétiche, caractère), `description` sur un lieu (la ligne LOCATION : le lieu de gauche à droite, sa lumière et son
   ambiance), et `furniture` sur un lieu (des ids d’images de meubles dessinés sur leur propre planche, par exemple
   `furniture_dining/table`, pour des meubles qu’aucun accessoire n’utilise encore). Un personnage sans `description`
   garde un emplacement `<describe: …>` dans son prompt.

<!-- step: write-prompts -->
2. **Écrire les prompts à partir du contenu.** Ne remplissez pas les modèles à la main.

   ```bash
   # dans le dépôt du moteur
   npm run prompts                      # games/<id>/prompts.md : toutes les planches, cases déjà découpées marquées "(exists — keep)"
   npm run prompts -- --missing         # seulement les planches où une image manque, et seulement leurs cases manquantes
   npm run prompts -- --out notes.md    # un autre fichier de sortie
   ```

   ```bash
   # dans le projet créé
   npx quest-n-click prompts            # game/prompts.md
   npx quest-n-click prompts --missing
   ```

   Le fichier a une section par planche à générer, toutes partageant un même bloc STYLE et une même planche de
   référence (`art/_reference.png`, ou la planche validée du héros tant qu’elle n’existe pas), et se termine par une
   liste de contrôle (voir [Ce que lit `npm run prompts`](#prompts)). Un assistant obtient le même texte par l’outil
   MCP `asset_prompts` (`{ missing?: boolean }`), qui renvoie aussi les ids d’images manquants en JSON. Dans le Studio,
   l’onglet **Assets** montre le prompt de chaque planche à côté de ses cases, avec un bouton **Copy prompt**.

<!-- step: generate-sheets -->
3. **Générer une planche par prompt**, dans cet ordre : la référence, le héros, les autres personnages, les objets, les
   décors, les meubles. Joignez la planche de référence à chaque prompt, pour le style. Enregistrez chaque planche en
   PNG.

<a name="cut-and-key"></a>

### Découper, détourer et relire

<!-- step: cut -->
4. **Découper chaque nouvelle planche** en un fichier par case, fond retiré :

   ```bash
   # dans le dépôt du moteur
   python3 tools/cut-sheet.py <sheet.png> <sheet-id>                 # → games/<id>/art/<sheet-id>/r<row>c<col>.png
   python3 tools/cut-sheet.py <sheet.png> <sheet-id> --cells r1c2,r3c1   # seulement ces cases
   ```

   ```bash
   # dans le projet créé
   python3 node_modules/@quest-n-click/engine/tools/cut-sheet.py <sheet.png> <sheet-id> --out game/art
   ```

   Ne découpez que la nouvelle planche. Le découpeur écrase sans demander une case qui existe déjà : donnez `--cells`
   avec les seules cases manquantes (la liste de contrôle de `prompts.md` écrit la commande ainsi). L’onglet Assets du
   Studio ne redécoupe jamais une case existante sans que vous la cochiez, et garde l’ancien fichier en sauvegarde. Les
   options du découpeur sont dans [le découpeur](#cutter).

<!-- step: review -->
5. **Relire les cases.** Dans le dépôt du moteur, `npm run page:review` construit une page avec chaque case de chaque
   planche et un choix garder / refaire / inutilisée par case (voir
   [Pages de relecture](create.review-pages.md#the-three-pages)). Ne régénérez que les cases à refaire.

<!-- step: prepare -->
6. **Préparer les images** pour le navigateur :

   ```bash
   # dans le dépôt du moteur, ou dans le projet créé
   npm run assets
   ```

   La commande ne prépare que les images citées par le contenu, écrit `assets.gen.json`, et ne retraite que ce qui a
   changé.

> [!LIMIT id=talk-tools-repo]
> Les outils du kit bouche (`tools/talk-kit.py`, `tools/talk-apply.py`, `tools/talk-normalize.py`) écrivent dans
> `games/<id>/private/` et `games/<id>/art/` : ils sont faits pour l’arborescence du dépôt du moteur. Dans un projet
> créé, découpez et placez les images de parole à la main, ou passez par l’onglet Assets du Studio.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `npm run assets` affiche `images: <n> ready (<m> processed), …` et aucune ligne `warning: missing images:`.
- `npm run validate` (projet créé : `npx quest-n-click validate`, ou `npm run verify`) ne signale aucun `image not found: "<id>"`.
- Le jeu (`npm run dev`) affiche l’image là où le contenu la nomme.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `warning: missing images: grandma/r3c4` à `npm run assets` | Aucun fichier au chemin source (`art/grandma/r3c4.png`, ou ce que dit `sources.json`) | Découpez la case, ou corrigez l’id dans le contenu |
| `image not found: "grandma/r3c4"` à `validate` | L’id n’est pas dans `assets.gen.json` : `npm run assets` n’a pas tourné depuis que le contenu le cite, ou la source manque | Lancez `npm run assets`, puis `validate` |
| Une cape ou des yeux sombres sont devenus des trous | Le fond de la planche est trop proche des couleurs de la figure | Choisissez un autre fond : [Choisir le fond des planches](#sheet-background) |
| Des trous dans une bouche ou des yeux au bord d’une figure | Le générateur a peint une partie « transparente » avec la couleur du fond | Même correction ; les prompts demandent déjà des figures opaques |
| `ok: … (fixed-grid fallback, no figure detected: […])` | Le découpeur n’a trouvé aucune figure dans ces cases et a découpé le rectangle fixe | Regardez ces cases : une case vide, ou une figure trop proche du fond |
| Une figure coupée en deux, ou deux figures dans une case | La figure touche ou dépasse un bord de case | Régénérez avec plus de marge ; ou `--auto` pour une planche qui n’est pas une grille régulière |

<a name="troubleshooting"></a>

## Ma nouvelle image n’apparaît pas dans le jeu

<a name="symptom"></a>

### Symptôme

Vous avez découpé ou remplacé une image, et le jeu montre toujours l’ancienne, un vide, ou rien.

<a name="causes"></a>

### Causes possibles, de la plus fréquente à la plus rare

1. **`npm run assets` n’a pas été relancé** après la découpe. Le jeu lit `public/assets/img/<id>.webp`, jamais le PNG
   de `art/`.
2. **Le fichier préparé est plus ancien que la source, et `assets` l’a sauté.** `npm run assets` ne retraite une image
   que si la date de modification de la source est plus récente que celle du WebP. Une source copiée avec son ancienne
   date (un `cp -p`, une archive, un checkout git d’un fichier plus ancien) est sautée.
3. **L’id ne correspond pas.** Le contenu cite `grandma/r3c4` ; le fichier est `art/grandma/r4c3.png`, ou le dossier
   de la planche porte un autre nom.
4. **Le navigateur sert sa copie en cache.** Les URL d’images portent `?v=<empreinte de public/assets>`, calculée au
   démarrage de Vite. Un `npm run dev` en cours garde l’empreinte de son démarrage ; le service worker d’un jeu déployé
   garde les images en cache (cache d’abord, 90 jours) jusqu’à ce que la version de l’URL change, ce que fait un
   nouveau build.
5. **Une surcharge de `sources.json`** envoie l’id vers un autre fichier (`overrides`, ou une liste de motifs essayés
   dans l’ordre).

<a name="diagnosis"></a>

### Diagnostic

```bash
# dans le dépôt du moteur
npm run assets                       # lire la ligne "missing images"
ls -l games/<id>/art/grandma/r3c4.png public/assets/img/grandma/r3c4.webp   # lequel est le plus récent ?
grep -n '"grandma/r3c4"' games/<id>/assets.gen.json
npm run validate
```

```bash
# dans le projet créé
npm run assets
ls -l game/art/grandma/r3c4.png public/assets/img/grandma/r3c4.webp
grep -n '"grandma/r3c4"' game/assets.gen.json
npx quest-n-click validate
```

<a name="fix"></a>

### Correction

<!-- step: fix-prepare -->
1. Lancez `npm run assets` (cause 1).

<!-- step: fix-stale -->
2. Pour la cause 2, supprimez le fichier préparé (`public/assets/img/<id>.webp`), ou touchez la source, puis relancez
   `npm run assets`. Changer `artStyle` dans `site.json` retraite toutes les images de lui-même.

<!-- step: fix-id -->
3. Pour la cause 3, renommez le fichier ou corrigez l’id dans le contenu, puis `npm run assets` et `npm run validate`
   (projet créé : `npx quest-n-click validate`).

<!-- step: fix-cache -->
4. Pour la cause 4, redémarrez `npm run dev` et rechargez la page. Pour un jeu déployé, refaites le build et
   redéployez : le nouveau build change la version de chaque URL d’asset ; un joueur la reçoit quand il accepte le
   bandeau de mise à jour. Voir [Sous-chemin, cache et service worker](create.deploy-issues.md).

<a name="size-and-colours"></a>

### Taille et couleurs qui ne collent pas à la planche de référence

C’est normal : un générateur d’images ne reproduit jamais exactement l’échelle ni les couleurs d’une image de
référence. Inutile de lutter ; on corrige après coup :

- **Images de parole d’un personnage déjà validé** : le kit bouche ([la parole](#character-talking)). Le corps reste le
  sprite validé, au pixel près.
- **Une planche de parole générée d’un bloc** : `python3 tools/talk-normalize.py <talk_sheet.png> <row>
  <validated_sprite.png> <output_folder>` (dépôt du moteur). Même hauteur, mêmes couleurs, même cadre pour les 6
  images, et la case « bouche fermée » devient la pose de repos.
- **Règle générale** : ne jamais mélanger, dans une même animation, des images issues de deux planches différentes.
  Une animation, une planche.

<a name="files-changed"></a>

## Fichiers ou données modifiés

| Fichier | Écrit par |
|---|---|
| `games/<id>/prompts.md` (projet créé : `game/prompts.md`) | `npm run prompts` |
| `games/<id>/art/<sheet-id>/r<row>c<col>.png` | `tools/cut-sheet.py` (mode grille) |
| `games/<id>/art/<sheet-id>/sprite_<row>_<col>.png` et `index.json` | `tools/cut-sheet.py --auto` |
| `public/assets/img/…webp`, `public/assets/video/…` | `npm run assets` |
| `games/<id>/assets.gen.json` | `npm run assets` (tailles en pixels, le style avec lequel il a été construit) |
| `.cache/refs.json` | `npm run assets` (les ids cités par le contenu) |

`public/assets` est généré : le `.gitignore` d’un projet créé l’exclut.

<a name="recovery"></a>

## Revenir en arrière

Le découpeur ne garde aucune sauvegarde : une case redécoupée est écrasée. Sauvegardez le dossier de la planche avant
de la redécouper, ou travaillez sous git et restaurez la case avec `git checkout -- <file>`. Les dispositions et les
kits bouche dépendent des cases : ne redécoupez jamais un sprite validé. L’onglet Assets du Studio garde l’ancien
fichier en sauvegarde quand vous cochez une case à redécouper. Les fichiers préparés se reconstruisent toujours :
supprimez `public/assets/img/` et lancez `npm run assets`.

<a name="images"></a>

## Comment une image est nommée, mise en cache et budgétée

Une image se désigne par `dossier/nom`, le chemin du fichier découpé dans le dossier `art/` du jeu, sans l’extension :
`grandma/r3c3` (planche de grand-mère, rangée 3, colonne 3), `items/r1c2`, `house/armchair`. Les décors s’appellent
`decor/<lieu>`. `npm run assets` ne prépare que les images citées par le contenu, et `npm run validate` signale toute
image manquante.

Après la première visite, le jeu met en cache toutes les images et tous les sons pour jouer hors ligne
(`offline: 'full'`, par défaut ; `'nearby'` ne garde que le lieu courant et ses voisins). Un jeu de 40 Mo pèse 40 Mo
sur le téléphone.

`assetBudgets` dans `game.ts` dit combien le jeu peut demander à un téléphone de télécharger :

| Budget | Ce qu’il borne | Depuis |
|---|---|---|
| `initialKB` | avant que le premier lieu soit jouable | |
| `roomKB`, `chapterKB` | par lieu, par chapitre | |
| `backgroundScoreKB` | les stems d’une partition | 3.6 |
| `decodedAudioMB` | la plus grande partition décodée | 3.6 |
| `offlineTotalKB` | le préchargement complet | 3.6 |
| `transitionPeakMB` | deux partitions, un pont et un stinger décodés à la fois | 3.6.1 |
| `initialJsKB` | le JavaScript d’une première visite, vérifié sur le build par `npm run verify:dist` | 3.9 |

`npm run weight` les vérifie, et une release les exige : voir [Build et release](create.build-release.md).

<a name="scale"></a>

### Échelle et transparence

- La taille en pixels du fichier ne fixe pas la taille à l’écran. Un accessoire est dessiné à la hauteur `h` que lui
  donne sa disposition (en unités logiques du lieu de 640 × 400), un personnage à sa `height`, réduite selon la
  profondeur ; la largeur suit les proportions de l’image, lues dans `assets.gen.json`. Voir
  [Géométrie](create.geometry.md).
- `npm run assets` recadre chaque sprite sur ses pixels opaques, puis le borne à 420 px sur son plus grand côté. La
  marge vide d’une case ne compte donc pas.
- Un décor devient 1280 × 800. Une source plus large (un lieu large) garde ses proportions sur 800 px de haut ; un
  `.jpg` est accepté là où un `.png` est attendu.
- La transparence vient du découpeur (fond détouré ou vraie couche alpha). `npm run assets` garde l’alpha qu’il trouve ;
  une surcharge avec `keyed: true` rend transparent un fond uni qui touche le bord.

<a name="pipeline"></a>

## La chaîne de préparation

`npm run assets` lance `tools/refs.ts`, qui liste les images et les sons cités par le contenu (lieux, personnages,
objets, carte, paramètres des mini-jeux, `skin`, écrans titre et générique, `ending.scratch`, et les `extraImages`
d’`index.ts`), puis `tools/assets.py`, qui les prépare. La partie sons est dans [Bruitages](create.sound-effects.md).

Les sources par défaut d’un jeu (dépôt du moteur ; dans un projet créé, `game/` remplace `games/<id>/`) :

| Quoi | Source | Sortie |
|---|---|---|
| image `planche/case` | `games/<id>/art/planche/case.png` | `public/assets/img/planche/case.webp` (recadrée, 420 px au plus) |
| décor `decor/<nom>` | `games/<id>/art/decor/<nom>.png` | `public/assets/img/decor/<nom>.webp` (1280 × 800) |
| vidéo | `games/<id>/art/decor/<nom>.mp4` | `public/assets/video/<nom>.mp4` (720p, muette) |
| musique, bruitages | `games/<id>/audio/music/<fichier>`, `games/<id>/audio/sfx/<fichier>` | `public/assets/audio/{music,sfx}/<fichier>` |

`games/<id>/sources.json` remplace ces motifs (`{id}`, `{name}`, `{file}`). Un motif peut être une liste de candidats
essayés dans l’ordre ; un motif audio peut fixer son débit (`{ "path": …, "rate": "64k" }`). `overrides` traite une
image à part :

```json
{
  "images": "private/extract/{id}.png",
  "decors": "private/asset/decor_{name}.png",
  "video": "private/asset/decor_{name}.mp4",
  "music": [{ "path": "private/audio/rendered/{file}", "rate": "64k" }, "private/audio/{file}"],
  "sfx": ["private/audio/sfx/{file}", "private/audio/sfx/densif/{file}", "private/audio/{file}"],
  "overrides": {
    "decor/france_map": [
      { "src": "private/asset/decor_france_map.png", "keyed": true, "fit": 1100, "quality": 85 },
      { "src": "private/asset/decor_map.png", "crop": [75, 590, 400, 880], "size": [1100, 982] }
    ],
    "decor/souk_chase": { "src": "private/asset/decor_souk_chase.png", "height": 800 }
  }
}
```

Les options d’une surcharge : `keyed` (un fond uni relié au bord rendu transparent, puis borné à `fit` px au plus, 420
par défaut), `crop` [x0, y0, x1, y1], `size` [l, h], `height` (largeur proportionnelle), `quality`. Une surcharge peut
être une liste : la première source qui existe est prise. Cet exemple a la forme du `sources.json` d’un vrai jeu, dont
les sources restent dans `private/`.

Avec `"artStyle": "pixel"`, `npm run assets` écrit du WebP sans perte, ne redimensionne qu’au plus proche voisin, et
réduit 4× un décor de plus de 640 px de large vers ses pixels d’art. Changer `artStyle` retraite toutes les images.

<a name="cutter"></a>

### Le découpeur : `tools/cut-sheet.py`

| Option | Défaut | Effet |
|---|---|---|
| `<sheet.png> <sheet-id>` | | La planche, et le dossier où vont ses cases (le nom des images : `<sheet-id>/r<row>c<col>`) |
| `--grid COLSxROWS` | `6x4` | La grille (`3x3`, `2x2` pour de plus gros objets) |
| `--out <dir>` | `games/<GAME>/art` | La racine des images (projet créé : `game/art`) |
| `--cells r1c2,r3c1` | toutes | Ne (re)découper que ces cases |
| `--auto` | | Sans grille : chaque sprite détecté où qu’il soit ; écrit `sprite_<row>_<col>.png` et `index.json` |
| `--tol`, `--min` | 40, 2500 | Mode auto : tolérance sur la couleur du fond, surface minimale d’un sprite en px |
| `--pixel` / `--cel` | `artStyle` de `site.json` | Forcer ou couper le traitement pixel art |
| `--scale`, `--colors` | 4, 32 | Pixel art : l’agrandissement de la planche, les couleurs par case |

La détection se fait par figure, pas par case fixe : une figure qui déborde un peu de sa case est quand même prise en
entier ; une case où rien n’est trouvé retombe sur son rectangle fixe, donc chaque case demandée est écrite. Le jeu est
`GAME`, sinon celui vers lequel pointe `.cache/game`, sinon `config.game` de `package.json` ; son `site.json` est
cherché d’abord à côté du dossier `--out`.

<a name="prompts"></a>

## Les prompts

Ces prompts ont servi, avec un modèle d’image (la génération d’images de ChatGPT), à produire les assets validés d’un
vrai jeu fait avec ce moteur. Chaque prompt produit une planche sur un fond uni (ou transparent) que le découpeur
retire : pensez l’asset final comme une grille dès le départ. `npm run prompts` les remplit pour votre jeu ; les modèles
ci-dessous sont ce qu’il remplit, les parties entre chevrons (`<...>`) étant celles du jeu. Les prompts restent en
anglais.

Ce que lit `npm run prompts`, dans le module du jeu et le dossier d’art :

- **personnages** (`cast.ts`) : la planche de base 6 × 4 avec les rangées de poses du moteur (`human()` ou `cat()`),
  les poses spéciales que le contenu utilise (clés `sprites` en plus, `{ pose: [who, p] }` et `{ anim: [who, p] }` dans
  les lieux, poses d’acteurs, `variants`) sur leurs cases, une nouvelle planche `<sheet>_poses` pour les poses qu’aucun
  sprite ne fournit encore (avec les lignes à ajouter à `cast.ts`), la règle du siège pour les poses assises, et le kit
  bouche pour les poses listées dans `mouths` ;
- **objets** : chaque image utilisée par un accessoire, un objet, un mini-jeu ou l’interface, groupée par dossier de
  planche, case par case ; les états d’un même accessoire sont « the SAME object, state … » pour garder taille et angle ;
- **décors** (`decor/<nom>` de chaque lieu) : LOCATION, les zones cliquables à montrer, et les EMPTY SPOTS pour les
  accessoires, meubles et personnages (gauche / centre / droite d’après `layout/<lieu>.json`) ;
- **meubles** : les accessoires dont l’image vit dans un dossier `furniture_*`, et la liste `furniture` du lieu ;
- une **liste de contrôle** : référence → héros → autres personnages → objets → décors → meubles, chacun avec sa
  commande `python3 tools/cut-sheet.py` (`--cells` pour les seules cases manquantes), puis `npm run assets`.

<a name="common-rules"></a>

### Règles communes

- **Style** : joindre une planche de référence. `hero_sheet.png` (ou toute planche de personnage déjà validée) pour les
  personnages, une planche d’objets pour les objets, le décor du lieu pour ses meubles.
- **Fond** : `#2B2E45` uni par défaut, sans dégradé, sans sol, sans ombre portée, sans grille, sans texte ni logo. Le
  découpeur retire ce bleu. `sheetBackground` dans `site.json` le change ([plus bas](#sheet-background)).
- **Lumière** : venant d’en haut à gauche.
- **Marques** : ne jamais écrire un nom de marque dans un prompt, comme « Darth Vader » : le filtre de contenu le
  bloque. Décrivez l’objet : « a small pink knight plush with a round helmet ».
- **Grille** : 1536 × 1024. 6 × 4 cases de 256 px pour les personnages et les objets, 3 × 3 ou 2 × 2 pour les gros
  objets.
- **États d’un objet** : même taille, même angle, même position d’une case à l’autre ; seul le changement décrit
  diffère.
- **Découpe** : ne découper que la nouvelle planche, dans son propre dossier (`--out` pour une autre racine). Ne jamais
  redécouper des sprites déjà validés.
- **Couleurs** : chaque prompt porte le même bloc COLOR RULES, quel que soit le style (`npm run prompts` l’ajoute au
  bloc de style et à chaque planche ; sur un décor, « sheet » se lit « image ») :

```
COLOR RULES:
- Use a limited palette. For each material (skin, hair, each garment, each object) use at most 4 flat tones: highlight, base, shadow, deep shadow.
- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow); shadows are darker, more saturated and shifted toward cool purple. Never make highlights by adding white, never make shadows by adding black.
- Flat, clearly separated areas: no gradients, no airbrush, no blur, no dithering.
- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.
- The same material keeps exactly the same tones on every cell of the sheet and on every animation frame.
```

<a name="art-style"></a>

### Style graphique : `cel` ou `pixel` (`artStyle` dans `site.json`)

`"artStyle": "cel"` (par défaut) est le rendu dessin animé peint : contours sombres nets, ombrage cel en aplats.
`"artStyle": "pixel"` bascule toute la chaîne en pixel art rétro :

- **Prompts** : la phrase STYLE devient « retro pixel art in the spirit of 1990s LucasArts adventures (Day of the
  Tentacle, Monkey Island 2), 1 pixel = 1 pixel, crisp, no anti-aliasing… ». Le canevas reste 1536 × 1024 (cases de
  256 px), dessiné en pixel art agrandi 4× : chaque figure vit sur une grille de 64 × 64 par case, un décor sur
  384 × 240. Chaque prompt reçoit le bloc strict après les COLOR RULES :

```
PIXEL RULES — strict:
- The whole canvas is drawn on a 384 x 256 pixel grid (64 x 64 per 256 px cell), scaled up 4x with hard edges: every art pixel is an exact 4 x 4 square of one single colour, aligned to the grid. No detail smaller than one art pixel.
- Exact flat RGB values: every pixel uses one of its material's tones exactly, never an in-between value.
- No anti-aliasing: no semi-transparent, blended or soft pixels on any edge, not even against the background.
- The same material keeps exactly the same RGB values on every frame and every cell.
```

- **Les outils font respecter ces règles après la génération**, car aucun modèle d’image ne les suit exactement : le
  découpeur (il lit `artStyle` ; `--pixel` / `--cel` le forcent, `--scale 4`, `--colors 32`) réduit chaque figure 4×
  au plus proche voisin, ne garde que des pixels entièrement opaques ou entièrement transparents, réduit chaque case à
  32 couleurs au plus (median cut, sans tramage) et fusionne les couleurs presque identiques (distance RVB < 8) en une
  seule valeur exacte, partagée par toutes les cases de la planche ; les cases sont écrites en PNG indexé (mode P,
  index 0 transparent). Les envois de planches et de cases du Studio font de même. `npm run assets` écrit ensuite du
  WebP sans perte, ne redimensionne qu’au plus proche voisin, et réduit 4× un décor de plus de 640 px de large vers ses
  pixels d’art.
- **Moteur** : mettez `skin: { pixelArt: true }` dans `game.ts` pour que les images agrandies gardent des bords nets
  (`image-rendering: pixelated`). Voir [Habillage et polices](create.skin-fonts.md).
- **Les échanges de palette** (`palette` sur un personnage, voir [Personnages](create.characters.md)) marchent mieux en
  `pixel` : les couleurs sont exactes.

<a name="sheet-background"></a>

### Choisir le fond des planches (`sheetBackground` dans `site.json`)

Une planche de sprites est dessinée sur un fond que le découpeur retire. Le défaut est un `#2B2E45` uni, et toute
couleur fixe échoue sur un personnage ou un autre : une cape noire ou des yeux sombres proches de `#2B2E45` partent
avec le fond ; un fond magenta mange les ombres que les COLOR RULES décalent vers le violet (rosées sur une tête
orange) ; et le générateur peint souvent les parties « à travers lesquelles on voit », une bouche creusée ou des yeux de
profil, avec la couleur du fond, qui deviennent des trous quand elles touchent le bord de la figure. Essayez, dans cet
ordre :

1. **`"sheetBackground": "transparent"`**, si votre outil d’image écrit une vraie couche alpha. Testez-le une fois :
   demandez-lui une petite figure sur fond transparent et lancez `python3 tools/check-alpha.py <image.png>`.
   `TRANSPARENT` veut dire une vraie alpha ; `FAKE CHECKERBOARD`, un damier gris et blanc peint à la place de la
   transparence (certains outils le font), et `OPAQUE`, aucune transparence. Avec une vraie alpha, il n’y a rien à
   détourer : les prompts demandent un PNG transparent et interdisent le damier peint, et le découpeur garde exactement
   les pixels opaques, sans regarder la couleur (une copie transparente d’une planche sur fond uni donne les mêmes
   cases).
2. **Sinon, la couleur unie la plus éloignée du dessin** : `python3 tools/pick-bg.py <planche | dossier de sprites |
   image> [...]`, lancé sur la planche de référence ou la planche précédente du personnage, classe cyan, magenta, vert
   et bleu selon leur distance à la couleur la plus proche du dessin (le fond propre à une planche mis de côté) et
   affiche `BEST #RRGGBB`. Mettez-la en `"sheetBackground": "#00FFFF"` ; le découpeur retire la couleur unie du bord,
   quelle qu’elle soit.

Dans les deux cas, les prompts disent que chaque pixel d’une figure est opaque, y compris l’intérieur des formes
creusées ou ouvertes (bouches, yeux). Sans `sheetBackground` (ou avec une valeur qui n’est ni `transparent` ni
`#RRGGBB`, ce qui avertit), tout reste sur `#2B2E45`. Les modèles ci-dessous montrent ce défaut ; `npm run prompts`
écrit celui du jeu. Les décors ne sont pas concernés, et les kits bouche gardent leur fond `#2B2E45` : les bouches sont
recollées à travers l’alpha du sprite validé, rien n’est détouré.

<a name="background"></a>

### Décor (1536 × 960, 16:10)

```
Create a background image for a point-and-click adventure game.
STYLE: match exactly the art style of the attached reference sheet (same clean dark outlines, clean cel shading with flat tones, warm saturated palette). A hand-painted background for a 1990s LucasArts point-and-click adventure, in the spirit of Day of the Tentacle and Monkey Island 2 remastered: cozy, funny, full of small details, but readable.
FORMAT: 1536 x 960 pixels (16:10).
COMPOSITION — follow it strictly:
- One single eye-level perspective: the back wall or horizon seen from the front, one vanishing point in the center. No fisheye, no isometric view, no tilted camera.
- Scale: an adult standing on the floor near the front is about one third of the image height.
- A clear, empty, walkable floor band across the lower part of the image, from about 58% to 95% of the height. Keep the center of the floor clear: large furniture stays against the walls.
- One single main light source, warm; shadows lean toward deep purple, never pure black.
DO NOT draw any people or animals. DO NOT write any text, letters, numbers or logos: signs and screens stay blank.
LOCATION: <describe the room, left to right, with its light and mood>
EMPTY SPOTS: <spots left empty, where the game will place stateful objects>
```

Les meubles qui gênent le passage, comme un canapé, une table ou un étal, se génèrent à part : le décor vide d’un côté,
les meubles de l’autre. Le moteur les trie ensuite en profondeur avec les personnages. Le prompt de la planche de
meubles :

```
Create an item sheet for a point-and-click adventure game.
STYLE: match exactly the art style, lighting and colors of the attached decor_<room>.png.
LAYOUT: canvas 1536 x 1024, an invisible grid of <columns> x <rows>, one object per cell, centered, nothing touching the cell borders. One single flat uniform background color #2B2E45, no gradient, no floor, no cast shadow on the background, no text.
Every object is seen from the SAME angle and at the SAME scale as in the attached decor.
<row by row: each piece of furniture, and its states if it has any>
```

<a name="objects"></a>

### Objets (planche 6 × 4)

```
Create an item sheet for a point-and-click adventure game: <theme of the sheet>.
STYLE: match exactly the art style of the attached item sheets: same clean dark outlines, same clean cel shading with flat tones, same warm palette and level of detail, Day of the Tentacle / Monkey Island 2 remastered spirit, funny and friendly. Objects are shown in a 3/4 view from slightly above.
LAYOUT — follow it strictly:
- Canvas 1536 x 1024 pixels, landscape.
- An invisible grid of 6 columns x 4 rows, every cell exactly 256 x 256 pixels.
- One object per cell, centered, filling about 70% of the cell. Nothing may touch or cross a cell border.
- When several cells show STATES of the same object, draw it with the exact same size, angle and position in each of those cells: only the described change differs.
BACKGROUND: one single flat uniform color #2B2E45 over the whole canvas. No gradient, no texture, no floor, no cast shadow on the background, no grid lines, no borders.
DO NOT add any text, letters, numbers, labels, logos or watermarks. No hands, no people. Consistent lighting from the upper left.
CELL BY CELL (left to right):
ROW 1: - cell 1: <object> - cell 2: <the SAME object, state 2> …
ROW 2: …
```

Les pièces de mini-jeu vues de dessus, comme des tuiles, ajoutent : « seen from DIRECTLY ABOVE, flat, no
perspective », une taille de tuile fixe, et des raccords au milieu de chaque bord.

<a name="character-base"></a>

### Personnage : planche de base (positions SCUMM)

```
Create a pixel-art character sprite sheet for a point-and-click adventure game.
STYLE: match exactly the art style of the first attached image (reference sheet): warm expressive cartoon caricature in the spirit of Day of the Tentacle and Monkey Island 2 remastered, clean dark outlines, clean cel shading with flat tones, head about one third of the body height, friendly and funny.
CHARACTER: <description: age, hair, glasses, build, outfit, signature accessory, personality>
SHEET LAYOUT — follow it strictly:
- Canvas 1536 x 1024 pixels, landscape.
- An invisible grid of 6 columns x 4 rows, every cell exactly 256 x 256 pixels. One figure per cell, centered horizontally.
- Full-body figures (rows 2 to 4) all at the SAME scale, about 220 pixels tall, feet resting on the same baseline 16 pixels above the bottom of each cell.
- Leave empty space around each figure: nothing may touch or cross a cell border.
ROW 1 — head-and-shoulders portraits, facing the viewer: neutral | smiling | talking (mouth open) | laughing | surprised | thinking (hand on chin)
ROW 2 — walk cycle, full body, profile facing RIGHT, 6 consecutive frames of one smooth walk loop: contact | down | passing | up | contact (other leg) | passing (other leg)
ROW 3 — full-body poses: standing facing the viewer | standing seen from the back | standing facing right | talking facing right with one hand gesturing | pointing to the right | reaching forward to pick up or use an object
ROW 4 — full-body walk: walking toward the viewer (3 frames) | walking away from the viewer, seen from the back (3 frames)
BACKGROUND: one single flat uniform color #2B2E45 over the whole canvas. No gradient, no texture, no vignette, no floor, no cast shadow on the background, no grid lines, no borders.
DO NOT add any text, names, labels, numbers, logos or watermarks. Same outfit, same colors and same proportions in all 24 cells. Consistent lighting from the upper left.
```

Plutôt que de compter sur une photo pour la ressemblance, décrivez entièrement le personnage par des mots dans la ligne
CHARACTER : plus la description est précise, plus le personnage reste cohérent d’une planche à l’autre, même générées
dans des conversations différentes.

Correspondance des poses avec le moteur : `portrait` = r1c2 ; `walk` = r2c1 à r2c6 ; `front` = r3c1 ; `back` = r3c2 ;
`idle` = r3c3 ; `point` = r3c5 ; `use` = r3c6 ; `walk_front` = r4c1 à r4c3 ; `walk_back` = r4c4 à r4c6.

Variante « tient un objet », pour un personnage qui porte toujours un accessoire fétiche (une canne, une peluche, un
outil) : même grille, mêmes poses, en ajoutant « now always holding <object> in her LEFT hand, clearly visible and
clearly separated from her coat ». La main libre fait toujours les gestes.

<a name="character-special"></a>

### Personnage : course, saut, poses spéciales

```
Create a pixel-art character sprite sheet for a point-and-click adventure game: SPECIAL POSES of the character of the attached <sheet>.png (same face, same outfit, same scale).
LAYOUT: canvas 1536 x 1024, 6 columns x 4 rows of 256 x 256 cells, one figure per cell, feet on the baseline 16 pixels above the bottom of each cell (except jumps, which rise above it), nothing touching the borders.
ROW 1 — running away, profile facing RIGHT: running frame 1 | frame 2 | frame 3 | frame 4 | jumping high, knees tucked | ducking low, sliding forward
ROW 2 — sneaking to the right on tiptoes, frame 1 | frame 2 | frame 3 | frozen pose 1 | frozen pose 2 | frozen pose 3
ROW 3 — <story-specific poses: sitting, gags, finale reactions (pinching nose, celebrating), stumbling, showing an object…>
ROW 4 — <other poses, or EMPTY (flat background only)>
BACKGROUND: one single flat uniform color #2B2E45, no gradient, no floor, no shadow, no grid lines. No text. Lighting from the upper left.
```

Pour un personnage assis, dessinez le siège avec lui et dites-le : « exactly as on the attached seated_poses.png row
N ». Pour deux personnages dans une case, dites « one single figure group ».

<a name="character-talking"></a>

### Personnage : parole (animation calme)

Le corps ne doit jamais changer pendant qu’un personnage parle : seule la bouche bouge. Sinon, il semble sauter d’une
pose à l’autre.

**Méthode conseillée : le kit bouche** (dépôt du moteur). On ne demande jamais au générateur de redessiner le
personnage. Il fournit seulement des bouches, qu’un script recolle sur le sprite validé.

1. **Préparer les kits :** `python3 tools/talk-kit.py`. Il écrit la tête du sprite validé, agrandie et copiée 6 fois
   dans une grille 3 × 2 (1536 × 1024), dans `games/<id>/private/talk_kits/<character>_<pose>.png`, et un fichier
   `.json` qui garde la position exacte de la tête. Les personnages et les poses se règlent en haut du script
   (`POSES`) : `profile` (`r3c3`), `front` (`r3c1`), et `seated` (`seated_poses`) pour ceux qui parlent assis.
2. **Envoyer chaque kit au générateur**, un kit par message, avec le prompt ci-dessous.
3. **Enregistrer la réponse** à côté du kit, sous le nom `<character>_<pose>_out.png` (ou `_chatgpt.png`).
4. **Recoller les bouches :** `python3 tools/talk-apply.py <character>_<pose>`. Le script aligne les 6 cases de la
   réponse entre elles, puis la case 1 sur la tête d’origine ; il repère ce qui a changé (bouche, yeux), corrige la
   couleur sur l’anneau autour, et ne recolle que cette zone sur le sprite validé. Sortie :
   `games/<id>/art/talk_<character>/<pose>/t1.png` … `t6.png` ; `t1` est exactement le sprite validé.
5. **Vérifier** : seuls la bouche et les yeux doivent bouger. Le script affiche la surface repeinte pour chaque image :
   quelques milliers de pixels, c’est normal ; des dizaines de milliers, une case est mal alignée.

Le générateur peut redessiner toute la tête dans un style un peu différent : ce n’est pas grave, seule la bouche est
reprise. Ce qui compte, c’est que les 6 cases de sa réponse soient cohérentes entre elles.

```
This image is a grid of 6 identical cartoon portraits (3 columns x 2 rows).
Keep EVERYTHING exactly identical in all 6 cells: same drawing, same size, same position, same colors, same style, same background, same image size (1536 x 1024).
Change ONLY the mouth, and the eyes in cell 5:
- cell 1 (top left): unchanged, mouth closed
- cell 2 (top middle): mouth slightly open, talking
- cell 3 (top right): mouth open, talking
- cell 4 (bottom left): mouth wide open, exclaiming
- cell 5 (bottom middle): eyes gently closed (blinking), mouth closed
- cell 6 (bottom right): mouth closed, small warm smile
Do not redraw, move, resize or recolor anything else. No text.
```

Conseils : un kit par message, et une nouvelle conversation tous les quelques personnages pour que le générateur ne
mélange pas les visages. S’il redessine trop, utilisez son outil de sélection pour ne surligner que les six bouches,
puis redonnez-lui le même texte.

Côté moteur : `t1` au repos ; pendant la parole, `t2`, `t3` et `t4` au hasard, jamais deux fois la même d’affilée,
toutes les 160 à 220 ms ; `t5` de temps en temps pour cligner ; `t6` à la fin d’une réplique joyeuse ; retour à `t1` à
la fin de la réplique.

**Autre méthode, pour un personnage tout neuf** : générez la planche de base et sa planche de parole dans la même
conversation, avec le prompt ci-dessous. Utile quand les couleurs d’un personnage se décident en même temps que ses
images de parole. Les deux planches sortent cohérentes, puis `tools/talk-normalize.py` les ramène à la même taille et
aux mêmes couleurs.

```
Create a pixel-art character sprite sheet for a point-and-click adventure game: TALKING FRAMES of a character who already exists.
STYLE: match exactly the art style of the attached <sheet>.png: warm expressive cartoon caricature in the spirit of Day of the Tentacle and Monkey Island 2 remastered, clean dark outlines, clean cel shading with flat tones.
CHARACTER: <name and short description> EXACTLY as on the attached sheet: same face, hair, glasses, beard, clothes, colors, proportions and scale.
IMPORTANT: in each row, the body, arms, hands, feet, hair and position are EXACTLY IDENTICAL in all 6 cells, like frames of an animation where ONLY the mouth and eyes change. Nothing else moves.
LAYOUT: canvas 1536 x 1024, 6 columns x 4 rows of 256 x 256 cells, one figure per cell, centered, same scale as the attached sheet, feet (or seat) on the same baseline 16 pixels above the bottom of each cell, nothing touching the borders.
ROW 1 — standing facing RIGHT, arms relaxed: mouth closed | mouth slightly open | mouth open | mouth wide open (exclaiming) | mouth closed, eyes blinking | mouth closed, small smile
ROW 2 — standing facing the viewer, arms relaxed: the same 6 mouth and eye states
ROW 3 — <pose where the character talks the most: seated, turned to the left…>: the same 6 mouth and eye states
ROW 4 — <special pose with the same 6 states, or EMPTY (flat background only)>
BACKGROUND: one single flat uniform color #2B2E45, no gradient, no floor, no shadow, no grid lines. No text. Lighting from the upper left.
```

<a name="object-animation"></a>

### Animation d’un objet (images en boucle)

```
Create an animation sprite sheet for a point-and-click adventure game: <object> <motion>, <n> consecutive frames of one smooth loop.
STYLE: match exactly the art style of the attached reference. Same size and position in every frame, only the motion changes.
LAYOUT: canvas 1536 x 1024, an invisible grid of 6 columns x <rows> rows, one frame per cell, read left to right then top to bottom, nothing touching the borders.
BACKGROUND: one single flat uniform color #2B2E45. No text.
```

<a name="art-consistency"></a>

## La cohérence graphique

- **Une seule planche de référence** pour le style, jointe à chaque prompt d’image.
- **Discipline des couleurs** : chaque prompt porte les COLOR RULES (au plus 4 aplats décalés en teinte par matière,
  une seule couleur de contour, les mêmes tons sur chaque image). `artStyle` choisit `cel` (par défaut) ou `pixel`,
  dont les outils imposent alors des couleurs exactes.
- **Générer les prompts, ne pas les improviser** : `npm run prompts` les écrit à partir du contenu (la `description`
  de chaque lieu et de chaque personnage), pour que noms, allures et tailles concordent.
- **Des décors avec une bande de sol vide** et sans personne : 1536 × 960 ; personnages et accessoires s’ajoutent par
  dessus.
- **Les accessoires à états, dessinés sur la même planche, même taille, même angle.** Dans le jeu d’exemple, les états
  `remote` et `searched` du fauteuil (`armchair`) sont `home2/r2c1` et `home2/r2c2` : côte à côte, pour que le
  changement ne saute pas.
- **Découper, puis relire** : le découpeur découpe une planche, `npm run page:review` montre chaque case avec garder /
  refaire / inutilisée. Ne régénérez que les cases à refaire.
- **Ne jamais redécouper un sprite validé.** Une planche à la fois, après une sauvegarde. Les dispositions et les
  bouches dépendent des cases.

Les raisons de conception derrière ces règles sont dans [Concevoir des énigmes](create.puzzle-design.md).

<a name="references"></a>

## Références

- [`tools/prompts.ts`](../../tools/prompts.ts), [`tools/cut-sheet.py`](../../tools/cut-sheet.py),
  [`tools/check-alpha.py`](../../tools/check-alpha.py), [`tools/pick-bg.py`](../../tools/pick-bg.py),
  [`tools/refs.ts`](../../tools/refs.ts), [`tools/assets.py`](../../tools/assets.py),
  [`src/engine/dom/assets.ts`](../../src/engine/dom/assets.ts) (la version `?v=` des URL d’assets).
- [Outils d’image](install.image-toolchain.md) · [Assets et découpe dans le Studio](studio.assets.md) ·
  [Provenance des assets](create.asset-provenance.md) · [Pages de relecture](create.review-pages.md) ·
  [Bruitages](create.sound-effects.md).
