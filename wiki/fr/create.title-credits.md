# Titre et générique

<a name="what-you-get"></a>

## Ce que vous obtenez

Un écran titre avec votre décor (ou une vidéo muette en boucle), votre logo, une ligne de texte en bas et sa musique,
puis Nouvelle partie et Continuer ; et le générique de fin, qui défile sur la vidéo du titre quand le joueur l’ouvre.

<a name="context-and-versions"></a>

## Contexte et versions

`game.ts` dans le dépôt du moteur (`games/<id>/game.ts`) ou dans un projet créé (`game/game.ts`). Les champs
ci-dessous sont ceux de la 4.4.0 ; vrai à partir de la 4.2.5 (le nom de commande `quest-n-click` utilisé plus bas).

<a name="prerequisites"></a>

## Prérequis

- Le décor sous forme d’id d’image que le jeu livre (voir [Images](create.images.md)), le logo sous un autre.
- Pour une vidéo : `ffmpeg`, dont se sert `npm run assets` pour l’encoder ([doctor](install.doctor.md)).
- Pour la musique : un morceau dans `audio.music` ([Musique en stems](create.music.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Modifiez `game.ts` ; lancez `npm run assets` à la racine du dépôt du moteur, ou du projet créé.

<a name="steps"></a>

## Étapes

<!-- step: title-screen -->
1. **L’écran titre.** Dans `game.ts` :

   ```ts
   titleScreen: { decor: 'decor/dining', logo: 'logo', music: 'theme', video: 'intro.mp4', footer: 'Un tout petit point-and-click. Tournez votre téléphone.' },
   ```

   `decor` est obligatoire ; `logo`, `music`, `video` et `footer` sont optionnels.

<!-- step: video -->
2. **Une vidéo, si vous en voulez une.** Mettez le fichier dans le dossier des décors du jeu, `art/decor/<nom>.mp4`
   (`games/<id>/art/decor/` dans le dépôt du moteur, `game/art/decor/` dans un projet créé), et nommez-le dans
   `video: '<nom>.mp4'`. Puis encodez-le :

   ```sh
   # dans le dépôt du moteur, ou dans le projet créé
   npm run assets
   ```

   Chaque `.mp4` de ce dossier devient `public/assets/video/<nom>.mp4` : H.264, 720 pixels de haut, sans son, prêt à être
   lu en continu. `games/<id>/sources.json` peut déplacer la source (`"video": "private/asset/decor_{name}.mp4"`).

<!-- step: credits -->
3. **Le générique.** Le texte, ligne par ligne ; une chaîne vide est une ligne blanche :

   ```ts
   credits: ['LE MARCHÉ DE NUIT', '', "Le chapitre de référence de quest'n'click (3.4)", '', 'Merci d’avoir joué !'],
   creditsScreen: { video: 'outro.mp4', decor: 'decor/street' },
   ```

   `creditsScreen` est optionnel : sans lui, le générique passe sur la vidéo du titre, avec le décor du titre pour
   affiche.

<!-- step: check -->
4. **Vérifier.** `npm run validate` (dépôt du moteur) ou `npx quest-n-click validate` (projet créé) refuse un
   aiguillage de texte ou `{hero}` dans le pied de page ou le générique ; `npm run dev` montre le titre.

<a name="title-and-credits"></a>

## Référence

| Champ | Forme | Ce qu’il fait |
|---|---|---|
| `titleScreen.decor` | id d’image | le fond, étiré pour couvrir l’écran ; l’affiche de la vidéo |
| `titleScreen.logo` | id d’image | le logo, qui tombe du haut ; son texte de remplacement est le `title` du jeu |
| `titleScreen.music` | id de `audio.music` | la musique, lancée au premier tap du joueur sur l’écran titre |
| `titleScreen.video` | nom de fichier dans `public/assets/video/` | une vidéo muette en boucle derrière le logo |
| `titleScreen.footer` | texte | une ligne en bas de l’écran ; traduite (`titleScreen/footer`) |
| `creditsScreen.video` | nom de fichier | la vidéo de fond du générique, assombrie ; par défaut celle du titre |
| `creditsScreen.decor` | id d’image | l’affiche de cette vidéo ; par défaut le `decor` du titre |
| `credits` | lignes de texte | le générique, une entrée par ligne, `''` pour une ligne blanche ; traduit (`credits[0]`, `credits[1]`…) |

Ce que voit le joueur :

- Le titre montre Nouvelle partie et Continuer (Continuer grisé sans sauvegarde), puis Remix quand le jeu a un autre
  monde que l’histoire ([Remix](create.remix.md)). Les libellés sont `ui.newGame` et `ui.continue`.
- Le générique s’ouvre depuis le menu pause (★, `ui.credits`) et depuis la carte de la fin scellée. Il défile en
  22 secondes environ ; un tap le ferme.

> [!LIMIT id=video-autoplay-blocked]
> Un navigateur qui refuse de lancer la vidéo (économie de données, mode basse consommation) laisse l’affiche, le
> `decor`, à sa place. Avec un `creditsScreen` qui a un `decor` mais pas de `video`, le générique n’a pas d’image de
> fond.

> [!LIMIT id=title-plain-text]
> Le pied de page et le générique s’affichent tels qu’écrits : le validateur y refuse les aiguillages de texte et
> `{hero}`.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run dev`, dans le dépôt du moteur ou dans le projet créé, ouvre le titre avec le décor, le logo, le pied de page ;
la musique part au premier tap ; Crédits dans le menu pause fait défiler vos lignes.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Pas de fond derrière le logo | L’image du `decor` n’est pas livrée | `npm run assets` ; vérifier l’id |
| La vidéo n’apparaît jamais | Pas encodée (`ffmpeg` absent) ou un autre nom de fichier | `npm run assets` ; `video` est le nom du fichier avec `.mp4` |
| Pas de musique sur le titre | Pas encore de tap, ou la musique coupée | Toucher le titre ; vérifier le réglage Musique |
| `"{hero}" in a text shown as written…` (validate) | Un aiguillage ou `{hero}` dans `credits` ou `footer` | Écrire le texte tel quel |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`game.ts` (`titleScreen`, `creditsScreen`, `credits`), `art/decor/*.mp4`, et `public/assets/video/` après
`npm run assets`. Les traductions de `titleScreen/footer` et `credits[n]` vont dans les fichiers de langue
([Traductions](create.translations.md)).

<a name="recovery"></a>

## Revenir en arrière

Retirez le champ de `game.ts` : tous sauf `titleScreen.decor` sont optionnels.

<a name="references"></a>

## Références

- [`src/engine/dom/menus.ts`](../../src/engine/dom/menus.ts) (`showTitle`, `credits`), [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts) (`titleScreen`, `creditsScreen`, `credits`), [`tools/assets.py`](../../tools/assets.py) (la vidéo)
- [La fin scellée](create.sealed-ending.md), [Habillage et polices](create.skin-fonts.md)
