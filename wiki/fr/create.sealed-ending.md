# La fin scellée

La fin scellée est un module facultatif : les derniers textes de votre jeu (un ticket à gratter, une annonce, une carte
finale avec photos) sont chiffrés dans un seul fichier avec un mot de passe, et ne sont donc jamais dans le code du
jeu. Un joueur qui ouvre les fichiers du jeu construit n'y lit rien ; la fin ne se montre que quand le jeu l'atteint.
Cette page la met en place, scelle une issue et vérifie que rien n'a fuité.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un fichier `public/data/dossier.bin` qui contient une issue choisie, chiffrée ; un jeu dont le module `ending` joue le
ticket à gratter, les confettis et le jingle, puis la carte finale ; et un build dans lequel `npm run check:spoilers` ne
trouve aucun texte de fin en clair.

<a name="context-and-versions"></a>

## Contexte et versions

- Le dépôt du moteur : `npm run seal` et `npm run check:spoilers` sont des scripts du dépôt du moteur, pour le jeu
  sélectionné (`GAME=<id>` ou `npm run game`).
- Le champ `ending` et sa lecture existent dans tout jeu. Depuis 4.1.2 (`npm run seal` n'affiche plus le mot de passe).
  Le type est `EndingDef` depuis 4.0 ; `RevealDef` est son ancien nom, déprécié, retiré en 5.0.

> [!LIMIT id=engine-repo-only]
> La commande `quest-n-click` d'un projet créé n'a ni `seal` ni `check:spoilers`. Son jeu peut jouer une fin scellée,
> mais le fichier se scelle depuis le dépôt du moteur.

<a name="prerequisites"></a>

## Prérequis

- Le dépôt du moteur, installé ([Installer depuis le dépôt](install.from-repository.md)).
- Un script qui termine le jeu avec la commande de fin (plus bas) et, si le joueur fait un pronostic, un drapeau que le
  script pose avec sa réponse.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, à sa racine, votre jeu sélectionné. La configuration privée vit dans `games/<GAME>/private/`,
que `.gitignore` tient hors du dépôt.

<a name="ending"></a>

## Le module `ending`

`GameDef.ending` le décrit :

```ts
// games/<GAME>/game.ts
ending: {
  file: 'data/dossier.bin',                         // produit par npm run seal
  password: { given: '…' },                         // ou { typed: true, prompt: 'Mot de passe ?' }
  guess: { flag: 'pronostic', labels: { a: '…', b: '…' }, right: '… {guess} …', wrong: '…', none: '…' },   // pronostic jugé sur la carte
  scratch: { ticket: 'items/r4c1', sfx: 'grattage' },   // paramètres du mini-jeu scratch
  card: { accent: '#d4145a' },                       // couleur du cadre de la carte et du texte gratté
},
```

| Champ | Sens |
|---|---|
| `file` | le fichier scellé, chargé sous le chemin de base du jeu. `npm run seal` écrit `public/data/dossier.bin` : écrivez donc `data/dossier.bin` |
| `password` | `{ typed: true, prompt }` : le joueur le tape, il n'est nulle part dans le bundle. `{ given }` : le moteur l'a, il est donc dans le bundle : une obfuscation, pas un secret |
| `guess` | facultatif : le pronostic du joueur, demandé au début (un drapeau que pose un script) et jugé sur la carte finale. `labels` donne le mot de chaque valeur du drapeau ; `{guess}` est remplacé dans `right`, `wrong` et `none` |
| `scratch` | les paramètres du mini-jeu de grattage : `ticket` (l'image) obligatoire, `sfx`, `color`… ; le texte caché vient du fichier scellé |
| `card` | `accent` : la couleur du cadre et du texte gratté (`#d4145a` par défaut) |

La commande `{ ending: true, after: […] }` joue, dans l'ordre : le ticket à gratter (le texte vient du fichier
chiffré), les confettis (`skin.icons.confetti`, `skin.sounds.confetti`) et le jingle (`skin.sounds.jingle`), puis
`after`, puis la carte finale (musique `skin.sounds.end`). Elle termine le jeu comme `end` (`state.done`, l'événement
`endingReached`, une sauvegarde). `{ reveal: true }` est l'ancien nom. Juste avant, le scénario joue ce qu'il veut (la
famille autour du canapé, le cadenas qui fond…).

Les textes de la fin ne sont **jamais** dans le contenu du jeu : ils sont dans `games/<GAME>/private/ending.config.ts`.
Si le fichier ne peut être lu ou déchiffré, le jeu affiche « … » à la place de la fin.

<a name="steps"></a>

## Étapes

<!-- step: private-config -->
1. **Écrire la configuration privée** à partir de l'exemple versionné, puis remplir les textes :

   ```sh
   # dans le dépôt du moteur
   mkdir -p games/<GAME>/private && cp games/<GAME>/ending.config.example.ts games/<GAME>/private/ending.config.ts
   ```

   Corrigez le chemin de l'import dans la copie : l'exemple importe `../../scripts/seal-types` ; depuis `private/`,
   c'est `../../../scripts/seal-types`. Son `password` doit être identique à `ending.password` dans
   `games/<GAME>/game.ts` (ou à ce que tapera le joueur). L'exemple du jeu de démo est
   [`games/demo/ending.config.example.ts`](../../games/demo/ending.config.example.ts).

<!-- step: seal -->
2. **Sceller une issue.** Seule l'issue choisie est chiffrée :

   ```sh
   # dans le dépôt du moteur
   npm run seal -- --outcome=<key>
   ```

   `<key>` est l'une des clés de `outcomes`. La commande affiche
   `✔  Sealed file (<key>) → public/data/dossier.bin (<taille> KB)` ; le mot de passe n'est jamais affiché.

<!-- step: check-spoilers -->
3. **Construire et chercher les fuites.**

   ```sh
   # dans le dépôt du moteur
   npm run build && npm run check:spoilers
   ```

   `npm run build` lance déjà `check:spoilers` à la fin (`build:game`) ; le relancer après un build ne coûte rien.

<a name="tools"></a>

## La configuration et les deux commandes

La configuration privée (`EndingConfig`, [`scripts/seal-types.ts`](../../scripts/seal-types.ts)) :

| Champ | Sens |
|---|---|
| `password` | identique au `ending.password` du jeu (given), ou à ce que tape le joueur (typed) |
| `outcomes` | des clés libres, chacune `{ ticket, headline, lines? }` : le texte sous la zone à gratter (HTML simple), l'annonce de la carte, des lignes en plus. La clé scellée est comparée au drapeau du pronostic (`ending.guess.flag`) |
| `message` | un mot court, commun à toutes les issues |
| `photos` | les photos de la carte, chemins relatifs à `games/<GAME>/private/` (jpg, png, webp, gif). `seal` avertit au-delà de 800 000 octets par photo |
| `lines` | des lignes communes, ajoutées après celles de l'issue |
| `judgeGuess` | `false` : le fichier scellé ne porte pas l'issue, et le pronostic n'est pas jugé (une version de test) |

**`npm run seal -- --outcome=<key>`** ([`scripts/seal.ts`](../../scripts/seal.ts)) lit
`games/<GAME>/private/ending.config.ts` ; sans lui, il prend l'exemple versionné et prévient (« using the EXAMPLE
configuration »). Un `--outcome` absent ou inconnu l'arrête avec la liste des clés. Il chiffre `{ ticket, headline,
message, photos, lines, outcome }` en AES-GCM (clé de 256 bits dérivée du mot de passe par PBKDF2, SHA-256, 120 000
itérations ; le mot de passe est comparé sans accents, casse, espaces ni ponctuation) et écrit
`public/data/dossier.bin`.

**`npm run check:spoilers`** ([`scripts/check-spoilers.ts`](../../scripts/check-spoilers.ts)) a besoin de `dist/` (il
s'arrête sur « dist/ not found: run npm run build first. »). Il cherche dans chaque fichier `.js`, `.html`, `.css`,
`.json` et `.txt` de `dist/` l'annonce, le texte du ticket (au-delà de deux mots) et les lignes de chaque issue, et la
première ligne du message ; il refuse un fichier privé dans `dist/` (un dossier `private`, un fichier
`*ending.config*` ou `*reveal.config*`) et un `dossier.bin` qui contient `ticket` ou `headline` en clair. Sortie 1 avec
le nombre de fuites. Un jeu sans fin scellée n'a que la vérification des fichiers privés.

> [!LIMIT id=format-frozen]
> Les champs du fichier scellé (`ticket`, `headline`, `message`, `photos`, `lines`, `outcome`) ne changent pas : un
> `dossier.bin` déjà scellé reste valide.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`check:spoilers` affiche « ✔ No sealed-ending text in clear text in dist/. ». Jouez jusqu'à la fin (`npm run dev`) : le
ticket se gratte sur l'issue scellée, puis la carte montre son annonce, le message, les photos et les lignes, avec le
verdict sur le pronostic du joueur.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| Le jeu affiche « … » au lieu de la fin | le fichier manque à `ending.file`, ou le mot de passe diffère | écrire `file: 'data/dossier.bin'` ; donner à la configuration le `password` du jeu |
| `⚠ … not found: using the EXAMPLE configuration` | pas de `games/<GAME>/private/ending.config.ts` | étape 1 |
| `Usage: npm run seal -- --outcome=<key> (keys: …)` | `--outcome` absent ou pas une clé de `outcomes` | passer une des clés listées |
| `✘ <fichier> contains in clear text: "…"` | un texte de fin est aussi dans le contenu du jeu | l'enlever du contenu : il n'a sa place que dans la configuration privée |
| `✘ private file in dist: …` | un fichier privé a été copié dans `public/` | l'enlever de `public/` |
| `⚠ dist/data/dossier.bin missing (npm run seal not run?)` | aucun fichier scellé dans le build | étape 2, puis reconstruire |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `games/<GAME>/private/ending.config.ts` (le vôtre, jamais versionné : `private/` est dans `.gitignore`).
- `public/data/dossier.bin`, écrasé à chaque `seal`.

> [!LIMIT id=one-dossier-per-repository]
> `seal` écrit `public/data/dossier.bin` à la racine du dépôt du moteur, quel que soit le jeu sélectionné : sceller un
> autre jeu remplace le fichier versionné de la démo. Rétablissez-le avec `git checkout public/data/dossier.bin` avant
> de committer, sauf si vous voulez le changer.

<a name="recovery"></a>

## Retour arrière

Sceller de nouveau avec un autre `--outcome` remplace le fichier ; le précédent n'est pas gardé.
`git checkout public/data/dossier.bin` ramène le fichier versionné.

<a name="references"></a>

## Références

- [`src/engine/ending/seal.ts`](../../src/engine/ending/seal.ts) (le format et le chiffrement),
  [`src/engine/ending/index.ts`](../../src/engine/ending/index.ts) (le côté lecteur).
- [Mini-jeux intégrés](create.minigames.md) (`scratch`), [Habillage et polices](create.skin-fonts.md) (les confettis et
  les sons), [Commandes du jeu](create.commands.md).
