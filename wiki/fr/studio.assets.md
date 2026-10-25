# Assets et découpe

L'onglet Assets liste chaque image et chaque son du jeu face à ce que le jeu utilise, donne à chaque planche son
prompt de génération, et reçoit les images et les sons générés qui les remplacent ou les complètent, en découpant les
planches en cases, sans jamais supprimer un fichier.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une planche de sprites générée, découpée en les cases que le jeu nomme, une image ou un son remplacé avec l'ancien
gardé à côté, et le jeu qui montre le nouveau dessin une fois préparé.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dans le dépôt du moteur ou un projet créé. Vrai depuis la 4.2.1 (chaque envoi est une opération du
journal du jeu). Le Studio de démo montre la liste en lecture seule ; un Studio hébergé a le même onglet avec ses
propres limites (plus bas).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Python 3 avec Pillow pour la découpe et le détourage (`tools/cut-sheet.py`), ffmpeg pour les sons, les chaînes
  d'outils image et audio : [Chaîne d'outils image](install.image-toolchain.md), [Chaîne d'outils audio](install.audio-toolchain.md).
- Les prompts et les ids de planche viennent du jeu : [Images : prompts, découpe des planches, transparence, échelle](create.images.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Assets. **Prepare assets** lance `npm run assets` pour vous, dans le dossier que sert
le Studio.

<a name="assets-tab"></a>

## L'onglet Assets

L'onglet liste tout ce qui se trouve sous `games/<id>/art/` et `audio/` face à ce que le jeu référence
([`tools/refs.ts`](../../tools/refs.ts)), avec les prompts de `npm run prompts` ([`tools/prompts.ts`](../../tools/prompts.ts)).

- **Arbre** (à gauche) : Characters (une entrée par planche de sprites, nommée d'après le personnage dont elle porte
  les poses), Objects, Backgrounds, Furniture, Talk kits, Sounds (musiques, bruitages). Pastilles : **rouge** = cases
  que le jeu référence sans fichier ; **orange** = utilisées mais pas préparées, ou plus anciennes que leur source ;
  **grise** = découpées mais inutilisées.
- **Planche** (au centre) : les cases en vignettes avec leur id et ce qui les utilise (`walk`, `portrait`,
  `items.key`, `house.props.pantry`…) ; filtres All / Used / Unused / Missing. Au-dessus, le panneau **Prompt** : la
  section de la planche dans les prompts avec **Copy prompt** (le bloc pour le modèle d'image), **Copy prompt for
  missing cells only** quand des cases manquent, et le bloc Style partagé (replié) avec son propre Copy.
- **Case** (à droite) : aperçu en grand, fichier, taille, ids d'image, préparée ou non, où elle sert (avec « Open
  room »), **Replace…**, et les sauvegardes.
- **Backgrounds** : le décor avec les zones cliquables, les accessoires (pied et hauteur), les acteurs et la zone de
  marche du lieu dessinés par-dessus, et la bande de sol en pointillés que le prompt demande de laisser vide ;
  Replace… et « + background ».
- **Sounds** : un lecteur par fichier, où il sert, Replace… (même extension) et Add sound…. Les ids de musique et de
  son que le jeu déclare sont listés, qu'un fichier existe ou non ; `npm run assets` livre ce qui est là et signale ce
  qui manque ([Musique](studio.music.md#audio-tools)).

<a name="steps"></a>

## Étapes

<!-- step: copy-prompt -->
1. Choisissez la planche dans l'arbre, **Copy prompt** (ou **Copy prompt for missing cells only**) et générez l'image
   avec votre modèle d'image.

<!-- step: upload-sheet -->
2. **Upload generated sheet…** envoie l'image avec l'id et la grille de la planche (6 × 4 par défaut). Elle est
   enregistrée sous `private/sheets/<sheetId>-<heure>.<ext>` et découpée par [`tools/cut-sheet.py`](../../tools/cut-sheet.py)
   dans `art/<sheetId>/`. Si des cases de cette planche existent déjà, une boîte de dialogue les liste, chacune avec
   une case **recut** : décochée, la case est gardée et seules les nouvelles cases sont découpées. Le résultat de la
   découpe s'affiche. Pour une planche qui n'a pas encore de dossier, utilisez **Upload sheet into a new sheet id…**
   dans la barre d'outils.

<!-- step: replace -->
3. Pour changer une seule image, sélectionnez la case et **Replace…**. Détourage : un fond uni est détouré par
   défaut ; choisissez « always » ou « never » pour l'imposer. Un décor (PNG ou JPEG) se remplace de même depuis
   Backgrounds, un son depuis Sounds (tout format que lit ffmpeg, même extension).

<!-- step: prepare -->
4. **Prepare assets (npm run assets)** dans la barre d'outils lance la chaîne avec sa sortie en direct dans un
   tiroir ; le nombre à côté est ce qu'elle traiterait. Ensuite la vue Rooms se recharge. Une case remplacée apparaît
   dans le jeu une fois préparée.

> [!GUARANTEE id=no-silent-recut]
> Un envoi qui redécouperait des cases existantes sans les nommer est refusé avec 409 et la liste de ces cases. Un
> envoi qui nomme une case ne redécoupe que cette case, et l'ancien fichier est d'abord gardé en `<nom>_v<N>`.

Rien n'est supprimé : un son ou un décor remplacé est lui aussi gardé en `<nom>_v<N>`.

Les sauvegardes ne sont pas des cases : la liste et les prompts les ignorent.

> [!LIMIT id=demo-read-only]
> Dans le Studio de démo, la liste vient de l'instantané (`assets` dans `snapshot.json`), les vignettes et les sons
> des fichiers préparés de `public/assets` (les cases inutilisées n'ont pas d'aperçu) ; les envois et Prepare sont
> cachés.

<a name="hosted"></a>
<!-- applies: 4.2.3.. -->

### Sur un Studio hébergé

Le même onglet, servi par le Studio Server sous `/api/assets`. Les envois sont bornés (10 Mio ; images PNG, JPEG ou
WebP, sons Ogg, MP3 ou WAV, reconnus à leurs octets) ; la découpe, le détourage et **Prepare assets (on the server)**
sont des jobs de l'application de traitement, sous le bail exclusif du projet, montrés dans un petit panneau avec un
bouton **Cancel** (un job annulé avant son écriture ne laisse rien). La planche envoyée elle-même n'y est pas gardée.
Voir [Assets hébergés](team.hosted-assets.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

La pastille de la case quitte le rouge ; après Prepare, elle quitte l'orange ; la case apparaît dans le jeu.
`git status` montre les nouveaux fichiers sous `art/<sheetId>/` et les sauvegardes `_v<N>` à côté.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| 409 avec `conflicts` à l'envoi | Des cases de cette planche existent et n'ont pas été nommées | Cocher **recut** pour les cases à remplacer, ou les laisser gardées |
| `` `sheetId` must be letters, digits, _ and - (not "decor") `` | Un mauvais id de planche | Utiliser l'id de planche du jeu |
| Une case remplacée n'apparaît pas dans le jeu | Pas encore préparée (pastille orange) | **Prepare assets** |
| La découpe échoue | Python 3 ou Pillow manque | [Chaîne d'outils image](install.image-toolchain.md) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/art/<sheetId>/<case>.png` et leurs sauvegardes `_v<N>` ; `art/decor/<nom>.<ext>` ;
`audio/<music|sfx>/<fichier>` ; la planche envoyée sous `games/<id>/private/sheets/` ; les fichiers préparés sous
`public/assets/` après Prepare.

<a name="recovery"></a>

## Revenir en arrière

Un fichier remplacé est gardé en `<nom>_v<N>` : recopiez-le sur la case, ou passez par git. Prepare peut être relancé
à tout moment.

<a name="references"></a>

## Références

- Côté serveur : [`tools/studio/assets.ts`](../../tools/studio/assets.ts) (monté sur `/__studio/api/assets`), la
  découpe dans [`tools/studio/cut.ts`](../../tools/studio/cut.ts). L'onglet : [`src/studio/assets.ts`](../../src/studio/assets.ts)
  avec son modèle, ses entrées-sorties et ses vues à côté (`assets-model.ts`, `assets-io.ts`, `assets-view.ts`,
  `assets-sheets.ts`, `assets-decors.ts`, `assets-sounds.ts`) ; les onglets Storyboard et Rooms sont découpés de même
  depuis la 4.1.8, chaque fichier sous 800 lignes.
- Les routes : [API du Studio](studio.api.md).
