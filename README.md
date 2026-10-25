# Jack cherche un taf

**Un jeu d'aventure point-and-click à l'ancienne, dans l'esprit de Day of the Tentacle et Monkey Island, qui se joue
dans le navigateur, sur ordinateur comme sur téléphone.**

**▶ [Jouer en ligne](https://lostinbrittany.github.io/web-scumm-jack-cherche-un-taf/)**, sur ordinateur ou sur
téléphone en mode paysage.

Le jeu existe en français, en anglais ([*Jack Needs a Job*](https://lostinbrittany.github.io/web-scumm-jack-cherche-un-taf/?lang=en))
et en espagnol ([*Jack busca curro*](https://lostinbrittany.github.io/web-scumm-jack-cherche-un-taf/?lang=es)). Il
choisit la langue du navigateur ; on la change dans le menu pause, Réglages, Langue. Les traductions sont dans
`game/locales/` (`npm run quest-n-click -- i18n status`).

*[English summary below](#in-english)*

![La place du village : Jack face au Brigadier Sans-Tête, qui ne laisse passer personne puisqu'il ne voit personne](/docs/img/place.webp)

## L'histoire

Jack est un squelette avec une citrouille sculptée en guise de tête. Son métier : faire peur aux visiteurs du Manoir
Frissonnant. Il le fait si bien qu'un car entier de touristes s'est enfui en courant… sans payer. Le Comte Radinoff,
vampire radin, le licencie sur-le-champ, trois jours avant Halloween.

Jack a jusqu'au 31 octobre pour retrouver un travail. Il croisera une momie très lente à l'agence pour l'emploi
« Pôle Frousse », un maire Frankenstein qui a perdu un boulon, Gloubi le blob éboueur qui avale tout, un policier
sans tête, une sorcière marchande de barbe à papa, un petit dragon qui a peur des enfants et un loup-garou comptable.

Comme dans les jeux LucasArts : **on ne meurt jamais et on ne reste jamais bloqué**.

## Captures

| | |
|---|---|
| ![Le bureau du Comte Radinoff, au Manoir Frissonnant](/docs/img/manoir.webp) | ![La fête foraine : Mémé Guimauve, Pépite le dragon, Mme Carrousel et Wolfgang](/docs/img/foire.webp) |
| **Le Manoir Frissonnant.** Le Comte Radinoff vient de licencier Jack. | **La fête foraine.** Des petits boulots à essayer… et à rater. |
| ![Le menu de dialogue de Gloubi, le blob éboueur](/docs/img/dialogue.webp) | ![Le mini-jeu de la barbe à papa : servir la bonne couleur au client](/docs/img/minijeu.webp) |
| **Les dialogues à choix**, avec chaque personnage. | **Le mini-jeu de Mémé Guimauve** : servir la bonne couleur de barbe à papa. |
| ![La carte du village : le manoir, la place, la fête foraine](/docs/img/carte.webp) | |
| **La carte du village**, pour voyager d'un toucher. | |

## Jouer

Il faut [Node.js](https://nodejs.org) 22.12 ou plus récent, et Python 3 avec Pillow (pour préparer les images).

```bash
git clone https://github.com/LostInBrittany/web-scumm-jack-cherche-un-taf.git
cd web-scumm-jack-cherche-un-taf
npm install
npm run assets      # prépare les images du jeu
npm run dev         # puis ouvrir http://localhost:5173
```

Pour jouer sur un téléphone ou une tablette du même réseau wifi : `npm run dev -- --host`, puis ouvrir l'adresse
« Network » affichée, **en mode paysage**.

**Comment on joue.** On choisit un verbe (Regarder, Parler, Prendre, Utiliser, Donner…) puis on touche une chose
ou un personnage. Un double toucher fait l'action évidente : franchir une porte, parler à quelqu'un, regarder le
reste. Perdu ? Parlez à **Mireille**, la petite araignée qui habite dans la tête de Jack (elle est dans
l'inventaire) : elle souffle des indices de plus en plus précis. Le bouton carte, en bas à gauche, permet de
voyager entre les lieux déjà découverts.

**Épisode 1** : le manoir, la place du village et la fête foraine, avec deux mini-jeux.
**Épisode 2** : le train fantôme de Wolfgang, ses fantômes en grève et deux nouveaux mini-jeux, jusqu'au fameux
métier de Jack (et à la revanche du Comte Radinoff).

## Comment il a été fait

Le jeu est écrit par **Anna et Horacio**, avec l'aide de Claude Code.

Il repose sur **[quest'n'click](https://github.com/Quest-n-Click/quest-n-click)** (anciennement web-scumm), un moteur
libre de point-and-click pour le navigateur. Avec quest'n'click, un jeu n'est pas du code mais des **données** : les lieux, les personnages, les objets,
les dialogues et les énigmes sont des objets TypeScript sans aucune logique. C'est ce qui permet au moteur de
**prouver que le jeu peut être terminé** depuis le début, sans impasse, à chaque modification.

La méthode suivie :

1. **Le scénario d'abord.** Toutes les répliques vivent dans
   [`game/storyboard.json`](/game/storyboard.json), relu et annoté sur téléphone.
2. **Les lieux ensuite**, dans [`game/rooms/`](/game/rooms) : ce qui se passe quand on regarde, prend,
   donne ou utilise quelque chose, et les indices de Mireille.
3. **Un premier jeu jouable avec des dessins provisoires**, pour tester l'histoire avant de dessiner.
4. **Les dessins en pixel art**, générés avec un modèle d'images à partir des consignes produites par le moteur
   ([`game/prompts.md`](/game/prompts.md)) et d'un brief
   ([`game/ART_BRIEF.md`](/game/ART_BRIEF.md)). Jack a été dessiné en premier et sert de référence de
   style à toutes les autres planches. Les planches sont découpées par l'outil du moteur, puis nettoyées par deux
   petits scripts du jeu ([`game/art-tools/`](/game/art-tools)).

### Vérifier le jeu

```bash
npm run verify      # tout ce qui est cité existe, et le jeu peut être terminé depuis « Nouvelle partie »
```

### Où sont les choses

```
game/
  storyboard.json    le scénario : la source de toutes les répliques
  game.ts            verbes, carte du village, début de partie, textes de l'interface
  cast.ts            les personnages
  items.ts           les objets de l'inventaire
  rooms/             un fichier par lieu : manoir, place, foire, train
  layout/            la géométrie de chaque lieu (zones cliquables, zone de marche)
  art/               les dessins découpés (art/ph : les dessins provisoires d'origine)
  art/sheets/        les planches d'origine, avant découpage (la source de tous les dessins)
  prompts.md         les consignes de génération d'images
  ART_BRIEF.md       le brief de l'agent qui a généré les images
  art-tools/         nettoyage du liseré magenta, réduction des décors
```

Le moteur vient de npm (`@quest-n-click/engine`, dans `package.json`). Sa documentation est
[le wiki de quest'n'click](https://github.com/Quest-n-Click/quest-n-click/wiki), en français et en anglais.
Les modifications du moteur que le jeu utilise avant leur publication sont dans `patches/`, appliquées
automatiquement par `patch-package` (voir `CLAUDE.md`).

## Licence

Le moteur quest'n'click est © Wano, sous [licence MIT](https://github.com/Quest-n-Click/quest-n-click/blob/main/LICENSE). Le jeu Jack cherche un taf (son histoire, ses
personnages et ses dessins, dans `game/`) est d'Anna et Horacio.

---

## In English

**Jack cherche un taf** ("Jack needs a job") is a point-and-click adventure in the spirit of Day of the Tentacle and
Monkey Island, playable in the browser on desktop and phone. Jack, a skeleton with a carved pumpkin for a head, is
fired from the haunted manor for being far too scary, three days before Halloween. He has until the 31st to find a
new job. You never die and never get stuck.

**▶ [Play online](https://lostinbrittany.github.io/web-scumm-jack-cherche-un-taf/?lang=en)**, on desktop or on a phone in
landscape. The game speaks French, English (*Jack Needs a Job*) and Spanish (*Jack busca curro*): it follows the
browser's language, and the pause menu's Settings switch it.

It is built on **[quest'n'click](https://github.com/Quest-n-Click/quest-n-click)** (formerly web-scumm), an open-source point-and-click engine where a game
is data, not code, so the engine can prove the game can be finished. The game lives in
[`game/`](/game); the engine comes from npm (`@quest-n-click/engine`).

```bash
npm install && npm run assets && npm run dev   # then open http://localhost:5173, in landscape on a phone
```

Written by Anna and Horacio, with Claude Code. Pixel art generated with an image model from the engine's prompts.
