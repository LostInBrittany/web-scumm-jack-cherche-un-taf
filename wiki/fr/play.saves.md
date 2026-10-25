# Sauvegardes : emplacements, export et import

Comment un jeu quest'n'click garde votre progression, comment sauvegarder dans un emplacement, comment passer une
sauvegarde sur un autre appareil, et ce que contient une sauvegarde. Les libellés cités sont ceux du jeu d’exemple en
français ; un autre jeu peut les formuler autrement.

<a name="what-you-get"></a>

## Ce que vous obtenez

Votre partie reprend où vous l’avez laissée, sur le même appareil, avec **Continuer** sur l’écran titre. Avec des
emplacements, vous gardez aussi plusieurs moments de l’histoire, et vous pouvez emporter une sauvegarde sur un autre
appareil sous forme de fichier.

<a name="context-and-versions"></a>

## Contexte et versions

Le joueur de n’importe quel jeu quest'n'click dans un navigateur. Vrai depuis la 4.1.15 (l’enveloppe de sauvegarde de
schéma 4, qui note le monde Remix où la partie se joue) ; les emplacements vivent dans IndexedDB depuis la 3.1. Les
emplacements n’existent que dans un jeu dont l’auteur les a activés (`saves.slots`) ; le jeu d’exemple en a trois.

<a name="prerequisites"></a>

## Prérequis

- Un navigateur qui garde les données du site. En navigation privée, ou avec un profil qui bloque IndexedDB, le jeu
  sauvegarde quand même, dans le stockage local, et le dit une fois.

<a name="where-to-run"></a>

## Où le faire

Dans le jeu, depuis le menu de pause (le bouton pause parmi les outils, ou Échap).

<a name="autosave"></a>

## La sauvegarde automatique

Le jeu sauvegarde tout seul à la fin de chaque action (quand le moteur redevient libre), quand vous changez de salle
et quand un script avance. Chaque écriture est relue et vérifiée. La ligne **Sauvegarde auto** du menu de pause
affiche ✓, ou ⚠ quand la dernière écriture a échoué ; un échec affiche aussi « Échec de la sauvegarde » avec la raison
du navigateur. **Continuer** sur l’écran titre reprend la sauvegarde automatique. **Recommencer** l’efface d’abord,
après confirmation ; si le navigateur refuse de l’effacer, vous gardez votre partie.

<a name="steps"></a>

## Étapes

<!-- step: save-slot -->
1. **Sauvegarder dans un emplacement** : menu de pause › **Sauver** › un emplacement. Chaque emplacement montre la
   salle et la date de sa sauvegarde, ou « vide ». Sauver sur un emplacement occupé demande d’abord « Écraser cet
   emplacement ? ».

<!-- step: load-slot -->
2. **Charger un emplacement** : menu de pause › **Charger** › un emplacement. Un emplacement vide ne se choisit pas.

<!-- step: export -->
3. **Exporter une sauvegarde dans un fichier** : menu de pause › **Sauver** › **Exporter en fichier**. Le navigateur
   télécharge `<jeu>-save.json`, la partie en cours.

<!-- step: import -->
4. **L’importer sur un autre appareil** : là-bas, ouvrez le même jeu, menu de pause › **Charger** › **Importer un
   fichier**, et choisissez le fichier JSON. La sauvegarde est écrite dans le premier emplacement libre (s’il y en a
   un), puis chargée.

<a name="export-import"></a>

## Passer une sauvegarde d’un appareil à l’autre

Les sauvegardes ne quittent jamais l’appareil d’elles-mêmes : il n’y a ni compte ni sauvegarde dans le nuage. Exporter
et Importer sont le moyen d’en déplacer une (d’un téléphone à un ordinateur, d’un ancien navigateur à un nouveau). Le
fichier contient votre partie pour ce jeu-là : l’importer dans un autre jeu est refusé (« save belongs to game … »).

Le même menu Sauver propose deux autres fichiers, pour signaler un bug plutôt que pour sauvegarder :

- **Partager la session** (une partie de test) : les actions depuis le début de la partie, avec des identifiants
  seulement et les endroits touchés à côté d’une cible. Elle ouvre le partage de l’appareil quand c’est possible,
  sinon télécharge `<jeu>-<date>.session.json`.
- **Exporter la session** : les actions depuis le début de la partie ou le dernier chargement, avec le journal du
  jeu ; les outils de l’auteur la rejouent à l’identique.

<a name="what-is-kept"></a>

## Ce que contient une sauvegarde, et ce qu’elle ne contient pas

Une sauvegarde, c’est l’état de votre partie : la salle, où se tient chaque personnage, le sac, ce que vous avez fait
et appris (drapeaux, compteurs, conversations vues), où en sont les scripts, la caméra, la position de la musique, et
pour un jeu Remix le monde où vous jouez. Elle ne contient pas vos réglages (vitesse du texte, volumes, langue : ils
restent à part dans le navigateur) ni vos records de speedrun.

Une sauvegarde écrite par n’importe quelle version 3.x ou 4.x du moteur se charge dans toute 4.x suivante : quand
l’auteur change le jeu d’une façon qu’une ancienne sauvegarde ne peut pas suivre, le jeu la convertit lui-même. Quand
une version plus récente d’un jeu n’a plus quelque chose que votre sauvegarde nomme, deux cas :

- **la salle où vous avez sauvegardé, ou le héros que vous jouiez, n’existe plus** : la sauvegarde est **refusée**
  (« state.room: unknown current room … »), et la partie en cours reste telle quelle. Chargez un emplacement plus ancien
  ou un fichier exporté ailleurs, ou prévenez l’auteur du jeu : une salle renommée avec une migration fait suivre la
  sauvegarde, qui se charge ;
- **autre chose a disparu** (un objet du sac, un lieu de la carte, une salle visitée, la position d’un personnage) : la
  sauvegarde se charge sans cela, et le jeu affiche « Sauvegarde adaptée à cette version » avec ce qu’il a laissé de
  côté.

Voir [Stabilité et support](start.stability.md#saves), et pour un auteur [État et sauvegardes](create.state-saves.md).

> [!GUARANTEE id=play-save-refused-untouched]
> La sauvegarde d’un autre jeu, une sauvegarde abîmée, ou une sauvegarde dont la salle courante n’existe plus est
> refusée, et la partie en cours reste telle quelle.

> [!LIMIT id=saves-device-only]
> Les sauvegardes vivent dans ce navigateur, sur cet appareil. Effacer les données du site les supprime. Dans un
> onglet Safari, Safari peut aussi les effacer après sept jours d’utilisation de Safari sans visite du jeu ; un jeu
> ajouté à l’écran d’accueil échappe à cette règle ([WebKit](https://webkit.org/tracking-prevention/)). Tout navigateur peut aussi évincer les données d’un site
> quand l’appareil manque de place. Le projet n’a pas testé ces règles sur un vrai appareil : exportez les sauvegardes
> qui comptent.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Après **Sauver**, l’emplacement montre la salle et l’heure, et un court message « Emplacement 1 ✓ ».
- Après **Importer un fichier**, le jeu charge l’état importé et le premier emplacement libre le contient.
- La ligne **Sauvegarde auto** du menu de pause affiche ✓.

<a name="common-errors"></a>

## Erreurs fréquentes

| Message | Cause | Correction |
|---|---|---|
| « Échec de la sauvegarde » | Le navigateur a refusé l’écriture (stockage plein, limites de la navigation privée) | Libérez de la place ; gardez le jeu ouvert et réessayez ; exportez la sauvegarde |
| « save belongs to game "x", not "y" » | Le fichier est la sauvegarde d’un autre jeu | Importez-le dans le jeu d’où il vient |
| « save version 5 cannot be migrated to 4 » | La sauvegarde est plus récente que cette copie du jeu | Mettez le jeu à jour (rechargez-le en ligne, acceptez la mise à jour), puis importez de nouveau |
| « this save was played in another world … » | Une sauvegarde Remix, faite dans un autre monde que celui ouvert | Ouvrez ce monde (le jeu le propose), ou gardez votre partie |
| « Ta partie sauvegardée vit dans un autre monde » | Un lien a ouvert un monde Remix alors que votre sauvegarde automatique est dans un autre | Choisissez **Continuer la partie sauvegardée**, ou commencez le monde du lien (il la remplace) |

Tous les cas : [Dépannage pour les joueurs](play.troubleshooting.md#save-will-not-load).

<a name="files-changed"></a>

## Fichiers ou données modifiés

Dans le navigateur : la base IndexedDB `web-scumm-saves` (son nom garde l’ancien nom du projet, comme identifiant de
format), ou, sans IndexedDB, les clés `<jeu>.save` et `<jeu>.slot.<n>` du stockage local. Exporter écrit un fichier
dans votre dossier de téléchargements.

<a name="recovery"></a>

## Reprise ou retour arrière

Un emplacement écrasé ne se récupère pas. Gardez un fichier exporté de la sauvegarde où vous voulez pouvoir revenir.
Une sauvegarde d’une ancienne version d’un jeu, dans le stockage local (avant la 3.1), est copiée une fois dans
IndexedDB, et l’ancienne copie n’est retirée qu’après vérification de la nouvelle.

<a name="for-authors"></a>

## Pour les auteurs : emplacements et migrations

Les emplacements sont un réglage du jeu (`game.ts`), avec les textes du menu dans `ui` :

```ts
saves: { slots: 3 },   // le menu de pause gagne Sauver / Charger avec trois emplacements, plus l'export et l'import en fichier JSON
ui: { …, save: 'Save', load: 'Load', slot: 'Slot {n}', emptySlot: 'empty', exportSave: 'Export to a file', importSave: 'Import a file', confirmOverwrite: 'Overwrite this slot?' },
```

Les emplacements manuels sont rangés comme la sauvegarde automatique : dans IndexedDB, sous forme d’enveloppes,
relues après chaque écriture ; un fichier importé remplit aussi le premier emplacement libre. Quand le contenu change
de façon incompatible, augmentez `saveVersion` et reportez l’état sous forme de données, une étape par version :

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { found: 'key_found' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { lobby: 'hall' }, renameProp: { 'hall.lamp': 'hall.lantern' }, dropFlag: ['tmp'] },
],
```

La chaîne doit arriver à `saveVersion` ; une sauvegarde sans chemin jusqu’à elle ne se charge pas (Continuer commence
alors une nouvelle partie). Les références facultatives devenues obsolètes sont retirées avec un avertissement
visible ; une structure abîmée, un autre jeu, une salle courante absente ou un joueur actif inconnu est refusé sans
toucher à la session en cours. Le sujet complet, avec le type `Migration` :
[État et sauvegardes](create.state-saves.md#migrations).

<a name="references"></a>

## Références

- [Stabilité et support](start.stability.md#saves) : quelles sauvegardes se chargent dans quelles versions.
- [Confidentialité](play.privacy.md#device) : ce qui reste sur l’appareil.
- Le code : [`src/engine/core/save.ts`](../../src/engine/core/save.ts),
  [`src/engine/dom/save-store.ts`](../../src/engine/dom/save-store.ts),
  [`src/engine/dom/menus.ts`](../../src/engine/dom/menus.ts).
