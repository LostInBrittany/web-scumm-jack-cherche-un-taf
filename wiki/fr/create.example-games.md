# Jeux d'exemple

Le dépôt du moteur contient cinq jeux sous `games/`. Chacun a sa raison d'être : un point de départ, un jeu d'exemple
qui montre chaque fonctionnalité une fois, un chapitre de référence que la CI prouve et joue, un exemple jouable du
choix du héros, et le jeu d'exemple du Reality Bridge. Lisez celui qui ressemble le plus à ce que vous voulez écrire
avant de l'écrire.

| Id | Titre | Lieux | Ce qu'il montre | Depuis |
|---|---|---|---|---|
| [`_template`](#template) | (le titre du nouveau jeu) | 1 | le point de départ de tout nouveau jeu | 1.0.0 |
| [`demo`](#demo) | The Pantry Key | 3 | chaque fonctionnalité du moteur une fois ; le jeu par défaut | 1.0.0 |
| [`reference`](#reference) | The Night Market | 8 | le chapitre de référence : deux chats jouables, mise en scène, Remix, catégories de speedrun | 3.4.0 |
| [`heroes`](#heroes) | Who Am I Today? | 1 | le choix du héros, en deux langues, voix par héros | 4.4.0 |
| [`signals`](#signals) | Signals | 1 | les signaux du monde extérieur (Reality Bridge) et les connecteurs | 4.1.1 |

<a name="playing-one"></a>

## En lancer ou en vérifier un

Dans le dépôt du moteur, le jeu courant est `GAME=<id>`, sinon le dernier jeu sélectionné (`npm run game`,
`npm run new-game`), sinon `package.json` → `config.game`, qui vaut `demo`.

```sh
# dans le dépôt du moteur, sur votre machine
GAME=reference npm run dev            # y jouer dans le navigateur
GAME=reference npm run solve          # un chemin de la nouvelle partie à la fin
GAME=reference npm run game           # en faire le jeu courant pour toutes les commandes suivantes
```

Un projet créé contient un seul jeu, dans `game/`, fait à partir de `_template`. Le paquet npm ne livre que
`games/_template/` : lisez les quatre autres dans le dépôt du moteur
([github.com/Quest-n-Click/quest-n-click](https://github.com/Quest-n-Click/quest-n-click), dossier `games/`).

<a name="template"></a>

## `_template`

### Forme

`games/_template/` : `game.ts`, `cast.ts`, `items.ts`, `rules.ts`, un lieu `rooms/start.ts` avec son
`layout/start.json`, `storyboard.json`, `site.json`, des images provisoires sous `art/`, et `tests/game.test.ts`. Les
chaînes `__ID__` et `__TITLE__` sont remplacées à la création.

### À quoi il sert

C'est la copie dont part tout nouveau jeu :

- `npm run new-game <id> ["Titre"]` (dépôt du moteur) le copie dans `games/<id>/`, dessine des images provisoires et en
  fait le jeu courant ;
- `quest-n-click create <dossier> ["Titre"]`, ou `npm init @quest-n-click <dossier>`, le copie dans `<dossier>/game/`
  sans son `tests/` (un projet créé vérifie son jeu avec `npm run verify`), et écrit un `provenance.json` qui marque les
  images comme provisoires.

Il déclare neuf verbes (Give, Open, Close, Take, Look, Talk, Use, Push, Pull), un héros, un `hintItem` (`note`) donné
au départ, et un `skin` qui pointe vers les icônes d'interface de départ.

### Contraintes

Les images provisoires sont dessinées à partir de formes (`tools/placeholder-art.py`). Une publication les refuse tant
que chaque fichier n'est pas remplacé et sa provenance relue (`quest-n-click provenance --lock`) : voir
[Provenance des assets](create.asset-provenance.md).

<a name="demo"></a>

## `demo` : The Pantry Key

### Ce que c'est

Un point-and-click de 15 minutes qui montre chaque fonctionnalité du moteur une fois. Pixel le chat veut les sardines ;
Grand-mère les a enfermées dans le garde-manger et a perdu la clé. Trois lieux : la maison de Grand-mère, le jardin, le marché.
Conception : `games/demo/STORY.md` ; chaque réplique : `games/demo/storyboard.json`.

### Ce qu'on y lit

- Deux chats jouables (`players`) : Pixel d'abord, Biscuit (endormi à la maison) qu'on peut prendre à tout moment, avec
  son propre inventaire.
- Des indices par un objet (`hintItem: 'shell_phone'`) dits par un personnage hors champ (`hintVoice: 'grandma_voice'`).
- Un tutoriel guidé dans l'intro (`guide`), un `choice` avant le premier lieu, et la [fin scellée](create.sealed-ending.md)
  qui juge ce pari (`ending`, `npm run seal`).
- Deux mini-jeux intégrés : `pipes` (jardin) et `pick` (marché) ([Mini-jeux intégrés](create.minigames.md)).
- Des points de sauvegarde qui sont aussi des chapitres (`goals` ; `npm run solve -- --chapters`), des objectifs, trois
  emplacements de sauvegarde manuelle.
- [Remix](create.remix.md) : l'endroit où le vendeur laisse la clé du garde-manger et la façon dont Pixel refuse les
  oranges, deux modes catalogue.
- Des ids stables écrits dans les sources et leur migration de sauvegarde (`ids.migration.json`, `saveVersion: 2`) :
  [État et sauvegardes](create.state-saves.md).
- Anglais et français (`locales/`), une session de playtest (`playtests/`), sa propre partie dans le navigateur
  (`e2e.mjs`), des prompts d'images (`prompts.md`) et une provenance verrouillée.

### Par défaut

`demo` est le jeu par défaut du dépôt du moteur (`package.json` → `config.game`).

<a name="reference"></a>

## `reference` : The Night Market

### Ce que c'est

Le deuxième vrai jeu du moteur (3.4, D13) : un chapitre de 30 à 45 minutes construit uniquement avec les images et les
sons du jeu d'exemple, recadrés. Soir de fête, toutes les lumières du marché sont éteintes, et Lou a besoin de la
lumière, du panneau de la fête et d'une lampe allumée. Huit lieux : street, market, alley, backlot, yard, kitchen,
cellar, hall. Conception : `games/reference/STORY.md`.

### Ce qu'on y lit

- Deux chats jouables qui ont besoin l'un de l'autre : un objet passé de l'un à l'autre, un passage ouvert à Biscuit
  seul, une porte que seul Pixel ouvre, un sol que l'un change pour l'autre ([Héros](create.heroes.md)).
- La scène : calques avec parallaxe, masques, zones de marche et liaisons, lumières et particules, un final minuté
  ([La scène](create.stage.md), [Géométrie](create.geometry.md)).
- Un personnage qui marche seul jusqu'à ce qu'un événement l'arrête (`scripts` `seller_rounds`, `events`)
  ([Scripts et événements](create.scripts-events.md)).
- Deux mini-jeux : `cables` (street) et `code-wheel` (hall) ; des choix dans les dialogues.
- Des catégories de speedrun (Any%, No Hints, Real Time, les catégories Remix, la roue prouvée) et des splits sur les
  objectifs ([Speedrun pour les auteurs](create.speedrun.md)) ; un manifeste Remix et des sessions de playtest Remix.
- Anglais et français.

### Contraintes

C'est un banc d'essai autant qu'une histoire. La CI le construit (`GAME=reference`), le prouve en entier et chapitre
par chapitre, et le joue jusqu'au bout au clavier dans Chromium et WebKit, et en français sans aucun texte anglais par
défaut visible. Un changement peut faire échouer la porte `reference`.

<a name="heroes"></a>

## `heroes` : Who Am I Today?

### Ce que c'est

L'exemple jouable du choix du héros (4.3.0 « Hero Choice », ajouté en 4.4.0, ADR 0022). Un lieu, le jardin. À la
nouvelle partie, trois héros sur des cartes à portrait (Pixel, Biscuit, Gaby la mouette), la même énigme pour chacun
(la clé du portail sous l'arrosoir).

### Ce qu'on y lit

- L'intro qui se joue avant l'arrivée dans le lieu, avec un `choice` dont les réponses sont des cartes à portrait
  (`img`).
- Le nom du héros dans les répliques (`{hero}`) et les mots employés pour chaque héros (`{form?…}`), en anglais et en
  français (`locales/fr.json`, où le français ajoute ses propres accords).
- Des répliques enregistrées par héros (`<id>~form=<valeur>` dans `audio.voices` et `audio.voicesByLang.fr`) ; une
  sauvegarde garde le héros.
- Il reprend les verbes et les images de `demo`.

### Contraintes

Son test navigateur (`e2e.mjs`) choisit chaque héros dans chaque langue, sauvegarde, reprend et termine. La CI le
construit et le prouve pour chaque héros (`GAME=heroes npm run solve -- --prove`). Voir [Héros](create.heroes.md) et
[Voix](create.voices.md).

<a name="signals"></a>

## `signals` : Signals

### Ce que c'est

Le jeu d'exemple du Reality Bridge (4.1.1). Un lieu, un jardin : le portail s'ouvre quand la bonne réponse arrive par
e-mail (un signal du monde extérieur), ou, si l'extérieur ne répond jamais, quand on utilise la radio sur le banc (le
repli du signal).

### Ce qu'on y lit

- `reality.signals` : un signal requis avec un repli, des signaux facultatifs, un signal qui peut arriver plusieurs
  fois (`once: false`).
- Depuis 4.1.9, les signaux des vrais connecteurs et ce que chaque connecteur peut transformer en signal : les mots
  d'une lettre (e-mail), les commandes d'un terminal (Telnet et SSH), des badges (Open Badges).
- Des scénarios pour le solveur simulé (`reality/scenarios/`) et un replay enregistré (`replays/`).

### Contraintes

La CI lance `GAME=signals npm run solve:reality` et le joue de bout en bout face à un Bridge de référence. Voir
[Ce qu'est le Reality Bridge](bridge.what-it-is.md) et [Les signaux et le manifeste](bridge.signals-manifest.md).

> [!LIMIT id=examples-not-templates]
> Seul `_template` est fait pour être copié. Les quatre autres sont des exemples et des bancs d'essai : leur contenu
> évolue avec le moteur, et `demo`, `reference` et `heroes` partagent images et verbes (`heroes` et `reference`
> importent le fichier de jeu de `demo`). Copiez une mécanique, pas un jeu entier.

<a name="related"></a>

## Identifiants liés

- `GAME`, `GAME_DIR`, `npm run game`, `npm run new-game`, `quest-n-click create`.
- [Votre premier jeu](create.first-game.md), [Organisation d'un projet créé](create.project-layout.md),
  [Mécaniques classiques](create.classics.md).
