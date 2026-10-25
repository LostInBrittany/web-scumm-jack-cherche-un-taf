# Héros : plusieurs personnages et choix du héros

Un jeu peut avoir plus d’un héros, de deux façons différentes. **Choisir le héros** (4.3.0) : à la Nouvelle partie,
le joueur choisit qui est le héros (un chevalier, une sorcière ou un robot ; un garçon ou une fille), et tout le jeu
suit ce choix. **Plusieurs personnages jouables** (à la Day of the Tentacle) : le joueur passe d’un personnage à
l’autre, chacun dans son propre lieu. Cette page déroule le premier avec le jeu d’exemple, puis donne la référence des
deux et dit quand choisir l’un ou l’autre.

<a name="what-you-will-build"></a>

## Ce que vous allez construire

Un jeu dont l’écran de Nouvelle partie demande « Qui suis-je ce matin ? » et montre une carte à portrait par héros.
Une fois le héros choisi, le personnage à l’écran a son allure et son nom, les répliques des autres emploient ce nom
(`{hero}`) et les mots qui lui conviennent (`{form?…}`), dans chaque langue, avec des voix enregistrées par héros. Une
sauvegarde garde le héros.

L’exemple terminé est dans le dépôt du moteur : `games/heroes`, « Qui suis-je aujourd’hui ? » (4.4.0). Un jardin, une
énigme (la clé du portail sous l’arrosoir), trois héros sur des cartes à portrait (Pixel, Biscuit, Gaby la mouette),
`{hero}` et des aiguillages dans les répliques de Grand-mère, une table française qui ajoute ses propres accords
(`Prêt{form?gull=e|*=}`), les répliques de Grand-mère doublées par héros dans les deux langues, une règle que seule la
mouette reçoit, et une sauvegarde qui garde le héros.

<a name="what-you-need"></a>

## Ce qu’il vous faut

- Un jeu qui tourne (`npm run dev`) : voir [Votre premier jeu](create.first-game.md).
- Pour l’exemple : le dépôt du moteur, installé ([Installer depuis le dépôt](install.from-repository.md)).
- Environ une demi-heure.

<a name="steps"></a>

## Étapes

<!-- step: play-example -->
1. **Jouer l’exemple.** Dans le dépôt du moteur, sur votre machine :

   ```sh
   # dans le dépôt du moteur
   GAME=heroes npm run dev
   ```

   Ouvrez l’URL affichée, appuyez sur Nouvelle partie : trois cartes, « Pixel », « Biscuit » et « Gaby ». Choisissez-en
   une ; Grand-mère salue ce héros par son nom.

<!-- step: flag-and-variants -->
2. **Un personnage, une variante par héros.** Choisissez un nom de drapeau pour le héros (`form` ici ; n’importe quel
   nom convient). Écrivez un personnage dont l’allure écrite est celle d’un des héros, et une variante par autre héros,
   chacune lue sur le drapeau et chacune avec son `name`, ses `sprites` et son `portrait` (le premier bloc de
   [la référence](#hero-choice)). Le `hero` du jeu est ce personnage.

<!-- step: intro-choice -->
3. **L’intro pose le drapeau.** Dans `start.intro`, un `choice` avec une option par héros, chacune avec `img` (son
   portrait) et `{ set: ['form', '<valeur>'] }`. L’intro se joue avant l’arrivée dans le premier lieu : le héros est
   choisi avant que quiconque parle. Rechargez : l’écran de Nouvelle partie montre les cartes.

<!-- step: switches -->
4. **Les mots des autres suivent le héros.** Dans les répliques, `{hero}` est le nom du héros, et
   `{form?knight=him|witch=her|*=it}` choisit les mots selon la valeur du drapeau (le second bloc de
   [la référence](#hero-choice)). Parlez au personnage : la réplique se lit pour ce héros.

<!-- step: check-every-hero -->
5. **Vérifier chaque héros.** `npm run solve` s’arrête au premier chemin gagnant, et un seul héros peut y suffire.
   Prouvez-les tous :

   ```sh
   # dans le dépôt du moteur
   GAME=heroes npm run solve -- --prove
   ```

   ```sh
   # dans un projet créé
   npx quest-n-click solve --prove
   ```

   La preuve vérifie chaque état atteignable, donc chaque héros, et signale comme softlock un héros qui ne peut plus
   finir.

<!-- step: translate-and-voice -->
6. **Traduire et doubler.** Une traduction écrit ses propres mots entre les accolades, avec le même drapeau et les
   mêmes valeurs ; les voix s’enregistrent une fois par valeur. Voir [Traductions](#hero-choice-translations) et
   [Voix](#hero-choice-voices) plus bas.

> [!LIMIT id=heroes-tutorial-scope]
> Ce parcours ne couvre pas les images des héros (leurs planches et portraits) : voir [Images](create.images.md). Les
> clips de voix de l’exemple sont provisoires (un babillage par héros, déclaré dans `games/heroes/provenance.json`).

<a name="hero-choice"></a>
<!-- applies: .. since 4.3.0 -->

## Référence : laisser le joueur choisir le héros

Le joueur choisit le héros à la Nouvelle partie : un chevalier, une sorcière ou un robot, un garçon ou une fille,
autant de héros que le jeu en déclare. Le héros garde les mêmes énigmes et les mêmes lieux ; ce qui change, c’est son
allure, son nom, et les mots que les autres emploient pour lui. Il faut un drapeau (`form` ici, n’importe quel nom
convient), un personnage avec une variante par héros, un choix d’intro qui pose le drapeau, et des aiguillages dans les
textes qui en dépendent.

> Où lancer les commandes : cette page les écrit pour le dépôt du moteur (`npm run validate`, `npm run solve`, précédées
> de `GAME=<id>` pour un autre jeu que celui par défaut). Dans un projet créé, les mêmes outils sont
> `npx quest-n-click validate`, `npx quest-n-click solve` (`--prove`, `--chapters`), `npx quest-n-click lint`,
> `npx quest-n-click i18n status` et `npx quest-n-click voices`, et les sources sont dans `game/` au lieu de
> `games/<id>/`.

```ts
hero: 'kid',
characters: {
  kid: {
    name: 'Robo', sprites: cat('robot'), portrait: 'robot/portrait',          // l'allure écrite est aussi un héros
    variants: [
      { if: { flag: 'form', eq: 'knight' }, name: 'Sire Lancelot', sprites: cat('knight'), portrait: 'knight/portrait' },
      { if: { flag: 'form', eq: 'witch' }, name: 'Morwen', sprites: cat('witch'), portrait: 'witch/portrait' },
    ],
  },
},
start: { room: 'hall', intro: [
  'Qui suis-je ce matin ?',
  { choice: [
    { text: 'Sire Lancelot', img: 'knight/portrait', do: [{ set: ['form', 'knight'] }] },
    { text: 'Morwen', img: 'witch/portrait', do: [{ set: ['form', 'witch'] }] },
    { text: 'Robo', img: 'robot/portrait', do: [{ set: ['form', 'robot'] }] },
  ] },
] },
checkpoints: {
  porte_sorciere: { room: 'hall', inventory: ['key'], flags: { form: 'witch', key_found: true } },
},
```

Et dans un lieu :

```ts
talk: { grandma: [{ topic: 'Bonjour, Grand-mère !', do: [
  { say: ['grandma', 'Bonjour, {hero} ! Prêt{form?witch=e|*=}, {form?knight=mon brave chevalier|witch=ma sorcière futée|*=mon robot qui brille} ?'] },
] }] },
look: { grandma: 'Grand-mère. La poussière {form?knight=le|witch=la|robot=le} fait éternuer.' },
```

- **Le `name` de la variante** remplace le nom du personnage tant que la variante s’applique, comme ses `sprites`,
  `mouths`, `portrait` et `palette` : la bulle, la transcription, l’en-tête de conversation et `{name}` dans une
  réplique de repli le lisent. La première variante dont le `if` tient l’emporte ; une valeur qu’aucune variante ne
  reconnaît garde l’allure et le nom écrits.
- **`{hero}`** est le nom du héros actif, celui de sa variante compris.
- **Un aiguillage** `{<drapeau>?<valeur>=<texte>|…|*=<texte>}` est le texte listé pour la valeur courante du drapeau ;
  `*=` couvre toutes les valeurs non listées, si bien qu’une réplique identique pour la plupart des héros ne liste que
  les exceptions (`content{form?witch=e|*=}`). Sans valeur qui corresponde et sans `*=` : le premier texte. Un texte
  sans `{` reste tel quel. Pas d’imbrication : deux aiguillages côte à côte. Un aiguillage lit n’importe quel drapeau,
  pas seulement celui du héros.
- **Où ils sont remplis** : quand un texte s’affiche, dans les répliques, les options de choix, les descriptions, les
  indices, les toasts, les sous-titres, les noms d’objets et les titres d’objectifs. Pas dans les noms de lieux, les
  verbes, les noms de personnages, `ui`, le titre, la carte, la fin scellée ni les params d’un mini-jeu : le
  validateur les y refuse. Le `name` d’une variante change le nom d’un personnage, et s’affiche tel qu’écrit lui
  aussi : donnez à chaque héros sa variante et son nom plutôt qu’un aiguillage.
- **L’intro se joue avant l’arrivée dans le premier lieu** : le héros est choisi avant que quiconque parle. Avec `img`,
  chaque option est une carte : le portrait, avec son `text` pour étiquette (et pour nom lu par le lecteur d’écran) ;
  les cartes passent à la ligne et défilent, si bien que tous les héros tiennent sur un téléphone. Sans `img`, les
  options restent des lignes de texte.
- **La logique reste de la logique** : une règle qui doit changer selon le héros porte
  `if: { flag: 'form', eq: 'witch' }`. Le solveur explore chaque réponse du choix d’intro, mais `npm run solve`
  s’arrête au premier chemin gagnant ; `npm run solve -- --prove` vérifie chaque héros. Les sauvegardes gardent le
  drapeau, les checkpoints le prennent dans `flags`.

> [!GUARANTEE id=hero-choice-save-keeps-hero]
> Une sauvegarde garde le héros : le drapeau qui l’a choisi est dans l’état sauvegardé, si bien qu’une partie chargée
> dans un nouveau moteur montre le même héros, avec son nom. Limite : le test charge une sauvegarde de la fixture des
> héros (`tests/fixtures/heroes.ts`) dans la même version du moteur ; ce que devient une sauvegarde après une mise à
> jour du moteur est dans [État et sauvegardes](create.state-saves.md).

<a name="hero-choice-translations"></a>

### Traductions

Les traductions écrivent leurs propres mots entre les accolades, avec le même drapeau et les mêmes valeurs
(l’aiguillage est rempli après la traduction) : `room:hall/look.grandma` →
`Grand-mère. La poussière {form?knight=le|witch=la|robot=le} fait éternuer.`. Une langue peut ajouter un aiguillage
dont sa source n’a pas besoin, pour sa grammaire : l’anglais `Ready?` devient `Prêt{form?witch=e|*=} ?`. Les noms des
variantes se traduisent aussi (`char:kid/variants[0].name`). `npm run i18n -- status` liste les traductions qui
perdent un choix de la source (un drapeau qu’elles n’aiguillent plus, une valeur ni listée ni couverte par `*=`) ; un
aiguillage ou une valeur ajoutés pour la grammaire sont voulus. Plus : [Traductions](create.translations.md).

<a name="hero-choice-voices"></a>

### Voix

Une réplique dont les mots suivent un drapeau (`{form?m=le|f=la}`) s’enregistre une fois par valeur : ses clips vont
dans `audio.voices` sous `<id>~<drapeau>=<valeur>` (`grandma_saw~form=f`). Avec plusieurs drapeaux dans une réplique,
triez-les par nom et joignez-les par `~` (`greet~form=f~mood=calm`) ; les valeurs s’écrivent en texte (`true`, `2`).
Le moteur joue le clip des drapeaux tels qu’ils sont et se rabat sur l’id seul quand ce clip manque ou qu’un drapeau
n’est pas encore posé : un jeu peut sortir avant que tout soit enregistré. `voicesByLang` prend les mêmes clés.
`npm run voices` (et l’onglet Voices du Studio) liste une ligne par valeur, chacune avec son texte, et
`npm run validate` avertit quand une réplique doublée n’a pas le clip d’une valeur. Les clés ne sont que des clés :
les noms de fichiers restent les vôtres. `{hero}` seul n’est pas un aiguillage : une telle réplique garde un seul clip.
Plus : [Voix](create.voices.md).

<a name="hero-choice-studio"></a>

### Dans le Studio

- **Voir chaque héros** : l’onglet Play a un sélecteur « Text switches » qui pose le drapeau, et l’onglet Rooms
  montre sous un texte à aiguillage comment il se lit.
- **Tous les héros dans toutes les langues d’un coup** (4.4.0) : l’onglet Voices, vue « Heroes × languages », est une
  matrice en lecture seule des répliques à id qui dépendent du héros (un aiguillage ou `{hero}`, dans n’importe quelle
  langue). Une colonne par héros (chaque valeur que prennent les drapeaux aiguillés, avec le portrait et le nom de sa
  variante) et par langue ; dans chaque case, le texte tel que ce héros le lit et le clip qui se joue, ou
  `missing <clé>` (avec l’id seul quand il se joue en repli). Une ligne dit aussi quand une langue a encore le texte
  de la source (`untranslated`), quand une traduction perd un choix de la source (`agreement`), et quand la valeur
  d’un héros n’est listée par aucun aiguillage de la réplique sans `*=` (`unlisted`). « Lines with a problem » ne
  garde que celles-là. Voir [Voix et matrice héros × langues](studio.voices-matrix.md).

<a name="hero-choice-messages"></a>

### Ce que disent les outils

- `npm run validate` : `malformed text switch "…"` (un `=` ou une `}` manquants, une valeur listée deux fois, une
  accolade à l’intérieur) ; `text switch "…" reads flag "form", which no command sets` ;
  `… lists value "x" for "form", which no set writes` ;
  `… has no text for "form" = "robot" (written at …): list it or add "*="` ; `{hero} in a text shown as written` ;
  `start.intro[1].choice[0].img › image not found: "…"`. Un drapeau compté avec `inc` ne se liste pas : son
  aiguillage demande `*=` (un avertissement).
- `npm run validate` avertit aussi : `voiced line with text switches lacks 1 of 3 clip(s) by value: sneeze~form=robot`.
- `npm run lint` : `hero-looks-default` (info) quand deux valeurs ou plus du drapeau du héros ne correspondent à
  aucune variante, si bien que ces héros ont l’air de celui écrit (une faute de frappe dans le `if` d’une variante, ou
  une variante pas encore écrite).

Les vérifications de l’exemple : `GAME=heroes npm run solve -- --prove` le prouve pour chaque héros ; son test
navigateur (`games/heroes/e2e.mjs`) choisit chaque héros en anglais et en français, sauvegarde, recharge, reprend et
termine.

<a name="several-characters"></a>

## Référence : plusieurs personnages jouables

```ts
hero: 'bernard',
players: { ids: ['bernard', 'hoagie', 'laverne'], start: { hoagie: { room: 'labo_passe' }, laverne: { room: 'labo_futur' } },
  give: 'Tiens, {nom} : {objet}.' },
```

- Chaque personnage jouable a son lieu, sa position et son sac (`sharedInventory: true` pour un sac commun).
  `players.start` dit où commencent les autres (par défaut : le lieu de départ, les mains vides).
- Le héros (`hero`) est celui contrôlé en premier. Un bouton par autre personnage se trouve dans la rangée d’outils
  (son portrait, ou son initiale) : le toucher, c’est `{ switchPlayer: 'hoagie' }`, et la vue passe dans son lieu.
- Un personnage inactif présent dans le lieu est dessiné et on peut lui **donner** un objet : il va dans son sac
  (`{ transfer: ['hamster', 'laverne'] }` fait pareil depuis un script, où qu’il soit). Sans règle écrite pour ce don,
  le héros dit la réplique `give`. Ses repères sont `{item}` (l’objet), `{name}` (le personnage) et `{target}` ;
  `{objet}`, `{nom}` et `{cible}` sont les trois mêmes sous leurs noms de la 4.0, toujours lus (l’exemple ci-dessus
  les emploie). Sans `give`, la réplique est `Here, {name}: the {item}.`.
- La condition `{ player: 'laverne' }` dit qui agit ; `'hero'` dans les commandes désigne toujours l’actif.
- Si un lieu déclare un acteur pour un personnage jouable, cet acteur le représente quand il est inactif (poses,
  sujets de conversation) ; il n’est pas dessiné deux fois.
- Les checkpoints acceptent `active` et `players: { id: { room, inventory } }`.
- Le solveur change de personnage comme le joueur (« Switch to hoagie » dans son chemin).

Deux classiques écrits ainsi : [l’arbre planté dans le passé](create.classics.md#tree-in-the-past) et
[le Chron-O-John](create.classics.md#chron-o-john).

<a name="which-to-use"></a>

## Lequel choisir, et pourquoi

**Choisir le héros, c’est un personnage avec des variantes, pas `players`.** Chaque personnage jouable a son bouton
dans la rangée d’outils et se tient dans son propre lieu : le joueur pourrait changer de héros en cours de partie.
C’est juste pour une équipe (les trois ados de Day of the Tentacle dans trois époques), faux pour « qui suis-je ».
Le choix du héros change l’allure, le nom et les mots, jamais les lieux ni les énigmes ; ce qui doit changer selon le
héros s’écrit en logique (un `if` sur le drapeau), que le solveur et la preuve voient.

**Pourquoi un drapeau et des aiguillages, plutôt qu’une copie de chaque réplique par héros.** Un aiguillage garde une
seule réplique avec un seul id : la traduction, la clé de voix et la matrice du Studio y restent attachées ; une valeur
couverte par `*=` ne demande aucune copie. Le prix : un aiguillage n’est rempli que là où un texte s’affiche au joueur
(pas dans les noms, les verbes ni `ui`), et un drapeau compté avec `inc` ne se liste pas valeur par valeur.

> [!LIMIT id=hero-choice-not-mid-game]
> Rien dans l’interface du joueur ne change le héros en cours de partie : le choix se fait dans l’intro. Une commande
> peut reposer le drapeau plus tard, et la variante suit alors, mais aucun écran ne le propose.

La trace de conception : [ADR 0022](../../docs/dev/adr/0022-hero-choice.md), décision D49 dans
[`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Un héros est un personnage avec des variantes lues sur un drapeau : [Personnages](create.characters.md).
- Le `choice` de l’intro pose ce drapeau avant le premier lieu : [Dialogues](create.dialogues.md).
- `{hero}` et les aiguillages font suivre les mots, dans chaque langue : [Traductions](create.translations.md),
  [Voix](create.voices.md).
- `npm run solve -- --prove` vérifie chaque héros : [Ce que prouve le solveur](create.solver-proofs.md).

<a name="next"></a>

## Pour aller plus loin

- [Voix : par langue et par héros](create.voices.md), pour enregistrer les répliques par héros.
- [Jeux d’exemple](create.example-games.md), pour lire `games/heroes` en entier.
- [Mécaniques classiques](create.classics.md), pour tout ce que le DSL fait déjà.
