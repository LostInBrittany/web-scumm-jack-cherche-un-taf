# Prompts pour générer les assets

Ces prompts ont été utilisés avec un modèle de génération d'images (ChatGPT image generation) pour produire les
assets validés d'un vrai jeu construit sur ce moteur. On les réutilise tels quels, en changeant seulement les
parties entre chevrons (`<...>`). Chaque prompt produit une planche sur un fond de couleur unie que
`tools/cut-sheet.py` retire au découpage : on pense donc la planche finale comme une grille dès le départ.

## Les générer pour son jeu : `npm run prompts`

Inutile de remplir les modèles ci-dessous à la main : `npm run prompts` écrit `games/<id>/prompts.md`, avec tous les
prompts du jeu prêts à coller, une section par planche à générer, qui partagent toutes un même bloc STYLE et une même
planche de référence (`games/<id>/art/_reference.png`, ou la planche validée du héros tant qu'elle n'existe pas).

```bash
npm run prompts                      # games/<id>/prompts.md : toutes les planches, cases déjà découpées marquées "(exists — keep)"
npm run prompts -- --missing         # seulement les planches où une image manque, et seulement leurs cases manquantes
npm run prompts -- --out notes.md    # un autre fichier de sortie
```

Il lit le module du jeu et le dossier d'art :
- **personnages** (`cast.ts`) : la planche de base 6 × 4 avec les rangées de poses du moteur (`human()` ou `cat()`),
  les poses spéciales que le contenu utilise (clés `sprites` en plus, `{ pose: [qui, p] }` et `{ anim: [qui, p] }`
  dans les lieux, poses des acteurs, `variants`) sur leurs cases, une nouvelle planche `<planche>_poses` pour les
  poses qu'aucun sprite ne fournit encore (avec les lignes à ajouter à `cast.ts`), la règle du siège pour les poses
  assises, et le kit de bouches pour les poses listées dans `mouths` ;
- **objets** : chaque image utilisée par un objet de décor, un objet d'inventaire, un mini-jeu ou l'interface,
  groupée par dossier de planche, case par case ; les états d'un même objet sont « the SAME object, state … » pour
  garder la taille et l'angle ;
- **décors** (`decor/<nom>` de chaque lieu) : LOCATION, les zones cliquables à montrer, et EMPTY SPOTS pour les
  objets, meubles et personnages (gauche / centre / droite d'après `layout/<lieu>.json`) ;
- **meubles** : les objets dont l'image est dans un dossier `furniture_*`, et la liste `furniture` du lieu ;
- une **checklist** : référence → héros → autres personnages → objets → décors → meubles, chacun avec sa commande
  `python3 tools/cut-sheet.py` (`--cells` pour les seules cases manquantes), puis `npm run assets`.

Trois champs optionnels l'alimentent (ils ne changent rien au jeu) :
- `description` sur un personnage (`CharacterDef`) : la ligne CHARACTER — âge, cheveux, lunettes, carrure, tenue,
  accessoire fétiche, caractère. Absente, le prompt garde un emplacement `<describe: …>`.
- `description` sur un lieu (`RoomDef`) : la ligne LOCATION — le lieu de gauche à droite, sa lumière, son ambiance.
- `furniture` sur un lieu (`RoomDef`) : les ids d'images des meubles dessinés sur leur propre planche (par exemple
  `furniture_dining/table`), pour ceux qu'aucun objet n'utilise encore.

Le même texte est disponible pour un assistant IA via l'outil MCP `asset_prompts` (`{ missing?: boolean }`), qui
renvoie aussi les ids d'images manquantes en JSON structuré. Les modèles ci-dessous sont ce que le générateur remplit.

## Règles communes

- **Style** : joindre une planche de référence. `hero_sheet.png` (ou toute planche de personnage déjà validée)
  pour les personnages, une planche d'objets pour les objets, le décor du lieu pour ses meubles.
- **Fond** : uni `#2B2E45` par défaut, sans dégradé, sans sol, sans ombre portée, sans grille, sans texte ni logo.
  Le découpage (`tools/cut-sheet.py <sheet.png> <sheet-id>`) retire ce bleu. `sheetBackground` dans `site.json` le
  change (plus bas, « Choisir le fond des planches »).
- **Lumière** : venant du haut à gauche.
- **Marques** : ne jamais écrire de nom de marque dans un prompt, comme « Darth Vader », car le filtre de
  contenu bloque. Décrire l'objet à la place : « a small pink knight plush with a round helmet ».
- **Grille** : 1536 × 1024. 6 × 4 cases de 256 px pour les personnages et les objets, 3 × 3 ou 2 × 2 pour les
  grands objets.
- **États d'un objet** : même taille, même angle, même position d'une case à l'autre, seul le changement décrit
  diffère.
- **Découpage** : ne découper que la nouvelle planche, avec `CUT_OUT` si besoin. Ne jamais redécouper des sprites
  déjà validés.
- **Couleurs** : chaque prompt porte le même bloc COLOR RULES, quel que soit le style (`npm run prompts` l'ajoute au
  bloc de style et à chaque planche ; sur un décor, « sheet » devient « image ») :

```
COLOR RULES:
- Use a limited palette. For each material (skin, hair, each garment, each object) use at most 4 flat tones: highlight, base, shadow, deep shadow.
- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow); shadows are darker, more saturated and shifted toward cool purple. Never make highlights by adding white, never make shadows by adding black.
- Flat, clearly separated areas: no gradients, no airbrush, no blur, no dithering.
- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.
- The same material keeps exactly the same tones on every cell of the sheet and on every animation frame.
```

### Style graphique : `cel` ou `pixel` (`artStyle` dans `games/<id>/site.json`)

`"artStyle": "cel"` (défaut) est le dessin animé peint ci-dessus : contours sombres nets, ombrage cel net en aplats.
`"artStyle": "pixel"` bascule toute la chaîne en pixel art rétro :

- **Prompts** : la phrase STYLE devient « retro pixel art in the spirit of 1990s LucasArts adventures (Day of the
  Tentacle, Monkey Island 2), 1 pixel = 1 pixel, crisp, no anti-aliasing… ». La toile reste en 1536 × 1024 (cases de
  256 px), dessinée en pixel art agrandi 4× : chaque figure tient sur une grille de 64 × 64 par case, un décor sur
  384 × 240. Chaque prompt reçoit le bloc strict après les COLOR RULES :

```
PIXEL RULES — strict:
- The whole canvas is drawn on a 384 x 256 pixel grid (64 x 64 per 256 px cell), scaled up 4x with hard edges: every art pixel is an exact 4 x 4 square of one single colour, aligned to the grid. No detail smaller than one art pixel.
- Exact flat RGB values: every pixel uses one of its material's tones exactly, never an in-between value.
- No anti-aliasing: no semi-transparent, blended or soft pixels on any edge, not even against the background.
- The same material keeps exactly the same RGB values on every frame and every cell.
```

- **Les outils font respecter ces règles après la génération**, car aucun modèle d'image ne les suit exactement :
  `tools/cut-sheet.py` (il lit `artStyle` ; `--pixel` / `--cel` le forcent, `--scale 4`, `--colors 32`) réduit chaque
  figure 4× au plus proche voisin, ne garde que des pixels totalement opaques ou transparents, réduit chaque case à
  32 couleurs au plus (median cut, sans tramage) et fusionne les couleurs presque identiques (distance RVB < 8) en une
  valeur exacte, partagée par toutes les cases de la planche ; les cases sont écrites en PNG indexé (mode P, index 0
  transparent). Les envois de planche et de case du Studio font de même. `npm run assets` écrit ensuite du WebP sans
  perte, ne redimensionne qu'au plus proche voisin, et réduit 4× un décor de plus de 640 px de large à ses pixels.
- **Moteur** : mettre `skin: { pixelArt: true }` dans `game.ts` pour que les images agrandies gardent des bords nets
  (`image-rendering: pixelated`).
- **Changement de palette** (`palette` sur un personnage, CONTENT_GUIDE.md) : marche le mieux avec `pixel`, dont les
  couleurs sont exactes.

### Choisir le fond des planches (`sheetBackground` dans `games/<id>/site.json`)

Une planche de sprites est dessinée sur un fond que le découpage retire. Par défaut c'est un `#2B2E45` uni, et toute
couleur fixe échoue sur un personnage ou un autre : une cape noire ou des yeux sombres proches de `#2B2E45` partent
avec lui ; un fond magenta mange les ombres que les COLOR RULES décalent vers le violet (rosées sur une tête orange) ;
et le générateur peint souvent les parties « à travers lesquelles on voit », une bouche ou des yeux sculptés vus de
profil, avec la couleur du fond, qui deviennent des trous dès qu'elles touchent le bord de la figure. Essayer, dans
cet ordre :

1. **`"sheetBackground": "transparent"`**, quand l'outil d'image écrit vraiment de l'alpha. Le tester une fois :
   lui demander une petite figure sur fond transparent et lancer `python3 tools/check-alpha.py <image.png>`.
   `TRANSPARENT` veut dire un vrai alpha ; `FAKE CHECKERBOARD`, un damier gris et blanc peint là où devrait être la
   transparence (certains outils font ça) ; `OPAQUE`, aucune transparence. Avec un vrai alpha il n'y a rien à
   détourer : les prompts demandent un PNG transparent et interdisent le damier peint, et `tools/cut-sheet.py` garde
   exactement les pixels opaques, sans regarder les couleurs (une copie transparente d'une planche sur fond uni donne
   les mêmes cases).
2. **Sinon, la couleur unie la plus éloignée du dessin** : `python3 tools/pick-bg.py <planche | dossier de sprites |
   image> [...]` sur la référence du personnage ou sa planche précédente classe cyan, magenta, vert et bleu selon
   leur distance à la couleur la plus proche du dessin (le fond propre d'une planche est laissé de côté) et affiche
   `BEST #RRGGBB`. La mettre dans `"sheetBackground": "#00FFFF"` ; le découpage retire la couleur unie du bord, quelle
   qu'elle soit.

Dans les deux cas, les prompts disent que chaque pixel d'une figure est opaque, y compris l'intérieur des formes
sculptées ou ouvertes (bouches, yeux). Sans `sheetBackground` (ou avec une valeur qui n'est ni `transparent` ni
`#RRGGBB`, ce qui donne un avertissement), tout reste sur `#2B2E45`. Les modèles ci-dessous montrent ce défaut ;
`npm run prompts` écrit celui du jeu. Les décors des lieux ne sont pas concernés, et les kits de bouches
(`tools/talk-kit.py`) gardent leur fond `#2B2E45` : les bouches sont recollées à travers l'alpha du sprite validé,
rien n'est détouré.

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

Les meubles qui gênent le passage, comme un canapé, une table ou des étals, se génèrent à part : le décor vide
d'un côté, les meubles de l'autre. Le moteur les trie alors en profondeur avec les personnages. Le prompt de la
planche de meubles :

```
Create an item sheet for a point-and-click adventure game.
STYLE: match exactly the art style, lighting and colors of the attached decor_<room>.png.
LAYOUT: canvas 1536 x 1024, an invisible grid of <columns> x <rows>, one object per cell, centered, nothing touching the cell borders. One single flat uniform background color #2B2E45, no gradient, no floor, no cast shadow on the background, no text.
Every object is seen from the SAME angle and at the SAME scale as in the attached decor.
<row by row: each piece of furniture, and its states if it has any>
```

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

Les éléments de mini-jeu vus de dessus, comme des tuiles, précisent : « seen from DIRECTLY ABOVE, flat, no
perspective », une taille de tuile fixe, et des raccords au milieu de chaque bord.

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

Plutôt que de s'appuyer sur une photo de référence pour la ressemblance, décrire entièrement le personnage en
mots dans la ligne `CHARACTER` : âge, cheveux, lunettes, silhouette, tenue, accessoire fétiche, personnalité. Plus
la description est précise, plus le personnage reste cohérent d'une planche à l'autre, même générées dans des
conversations différentes.

Correspondance avec les poses du moteur : `portrait` = r1c2 ; `walk` = r2c1 à r2c6 ; `front` = r3c1 ; `back` =
r3c2 ; `idle` = r3c3 ; `point` = r3c5 ; `use` = r3c6 ; `walk_front` = r4c1 à r4c3 ; `walk_back` = r4c4 à r4c6.

Variante « avec un objet tenu », pour un personnage qui porte toujours un accessoire fétiche (une canne, une
peluche, un outil) : même grille, mêmes poses, en ajoutant « now always holding <object> in her LEFT hand,
clearly visible and clearly separated from her coat ». La main libre fait les gestes.

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

Pour les personnages assis, dessiner le siège avec eux et le préciser : « exactly as on the attached
seated_poses.png row N ». Pour deux personnages dans une même case, préciser « one single figure group ».

### Personnage : parole (animation calme)

Le corps ne doit jamais changer pendant qu'on parle : seule la bouche bouge. Sinon, le personnage semble sauter
d'une pose à l'autre.

**Méthode recommandée : le kit de bouches.** On ne demande jamais au générateur de redessiner le personnage. Il
ne fournit que des bouches, qu'un script recolle sur le sprite déjà validé.

1. **Préparer les kits :** `python3 tools/talk-kit.py`
   - Il écrit la tête du sprite validé, agrandie et recopiée 6 fois dans une grille de 3 × 2 (1536 × 1024), dans
     `games/<id>/private/talk_kits/<character>_<pose>.png`.
   - Il écrit aussi un fichier `.json` qui garde la position exacte de la tête.
   - La liste des personnages et des poses se règle en haut du script (`POSES`) : `profile` (`r3c3`), `front`
     (`r3c1`), et `seated` (`seated_poses`) pour ceux qui parlent assis.
2. **Envoyer chaque kit au générateur**, un kit par message, avec le prompt ci-dessous.
3. **Enregistrer la réponse** à côté du kit, sous le nom `<character>_<pose>_out.png` (ou `_chatgpt.png`).
4. **Recoller les bouches :** `python3 tools/talk-apply.py <character>_<pose>`
   - Le script cale d'abord les 6 cases de la réponse entre elles, puis la case 1 sur la tête d'origine.
   - Il repère ce qui change (bouche, yeux) et corrige la couleur sur l'anneau autour.
   - Il ne recolle que cette zone sur le sprite validé.
   - Sortie : `games/<id>/art/talk_<character>/<pose>/t1.png` … `t6.png`. `t1` est exactement le sprite validé.
5. **Vérifier** : seules la bouche et les yeux doivent bouger. Le script affiche la surface reprise pour chaque
   image : quelques milliers de pixels, c'est normal ; des dizaines de milliers, c'est qu'une case est mal
   alignée.

Le générateur peut redessiner toute la tête dans un style un peu différent : ce n'est pas grave, seule la bouche
est reprise. Ce qui compte, c'est que les 6 cases de sa réponse soient cohérentes entre elles.

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

Conseils : un kit par message, et une nouvelle conversation tous les quelques personnages pour que le générateur
ne mélange pas les visages. S'il redessine trop, utiliser son outil de sélection pour ne surligner que les six
bouches, puis redonner le même texte.

Côté moteur : `t1` au repos ; pendant la parole, `t2`, `t3` et `t4` au hasard, jamais deux fois la même d'affilée,
toutes les 160 à 220 ms ; `t5` de temps en temps pour cligner ; `t6` à la fin d'une réplique joyeuse ; retour à
`t1` à la fin de la réplique.

**Autre méthode, pour générer un nouveau personnage de zéro :** générer la planche de base et sa planche de
parole dans la même conversation, avec le prompt ci-dessous. C'est utile quand les couleurs d'un personnage se
décident en même temps que ses images de parole. Les deux planches sortent alors cohérentes, puis
`tools/talk-normalize.py` les ramène à la même taille et aux mêmes couleurs.

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

### Animation d'un objet (images en boucle)

```
Create an animation sprite sheet for a point-and-click adventure game: <object> <motion>, <n> consecutive frames of one smooth loop.
STYLE: match exactly the art style of the attached reference. Same size and position in every frame, only the motion changes.
LAYOUT: canvas 1536 x 1024, an invisible grid of 6 columns x <rows> rows, one frame per cell, read left to right then top to bottom, nothing touching the borders.
BACKGROUND: one single flat uniform color #2B2E45. No text.
```

### Taille et couleurs qui ne collent pas à la planche de référence

C'est normal : un générateur d'images ne reproduit jamais exactement l'échelle ni les couleurs d'une image
jointe. On ne cherche pas à le forcer, on corrige après coup :
- **Parole d'un personnage déjà validé** : le kit de bouches ci-dessus (`tools/talk-kit.py` puis
  `tools/talk-apply.py`). Le corps reste le sprite validé au pixel près.
- **Planche de parole générée d'un bloc** : `python3 tools/talk-normalize.py <talk_sheet.png> <row> <validated_sprite.png> <output_folder>`. Même hauteur, mêmes couleurs, même boîte pour les 6 images, et la case « bouche fermée » devient la pose de repos.
- **Règle générale** : ne jamais alterner, dans une même animation, des images qui viennent de deux planches
  différentes. Une animation, une planche.
