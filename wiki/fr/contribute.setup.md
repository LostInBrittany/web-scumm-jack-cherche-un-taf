# Préparer son poste de développement

D'un dossier vide à un dépôt du moteur dont les vérifications tournent sur votre machine. Une quinzaine de minutes,
surtout des téléchargements.

<a name="what-you-will-build"></a>

## Ce que vous allez obtenir

Un clone de `Quest-n-Click/quest-n-click` avec ses dépendances, les modules Python d'image, un Chromium de Playwright, et un
rapport de `npm run doctor` sans élément obligatoire manquant. À la fin, le jeu d'exemple tourne dans votre navigateur
et la suite unitaire passe.

Cette page sert à travailler **sur le moteur**. Pour faire un jeu avec un moteur publié, créez plutôt un projet
([Votre premier jeu](create.first-game.md)) ; pour installer depuis le dépôt sans contribuer, voir
[Installer depuis le dépôt](install.from-repository.md).

<a name="what-you-need"></a>

## Ce qu'il vous faut

- **Git**.
- **Node.js 22.12 ou plus récent** (`engines` de `package.json` : `>=22.12`). Le `.nvmrc` du dépôt dit `22` : `nvm use`
  prend donc la 22 la plus récente que vous avez installée ; vérifiez qu'elle est au moins en 22.12. Le Studio, les
  outils qui écrivent un jeu et le Reality Bridge sur SQLite demandent **22.13 ou plus** (`node:sqlite`).
- **Python 3** avec les modules de `requirements.txt` (Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1) : les tests d'assets
  et `npm run assets` s'en servent. La CI utilise Python 3.12.
- **ffmpeg** (facultatif) : la création audio, et `validate --release`, qui mesure les stems de musique avec `ffprobe`.
- Environ 2 Go de disque pour `node_modules` et les navigateurs.

Les versions exactes par système sont dans [Prérequis](install.requirements.md).

<a name="steps"></a>

## Étapes

Chaque commande ci-dessous se lance dans un terminal, dans le dépôt du moteur une fois cloné.

<!-- step: clone -->
1. **Clonez le dépôt** et entrez dedans.

   ```sh
   # dans le dossier qui contiendra le clone
   git clone https://github.com/Quest-n-Click/quest-n-click.git
   cd quest-n-click
   ```

   Vous voyez les dossiers du dépôt : `src/`, `games/`, `tools/`, `tests/`, `wiki/`…

<!-- step: node -->
2. **Choisissez Node.** Avec nvm :

   ```sh
   # dans le dépôt du moteur
   nvm use
   node --version
   ```

   `node --version` affiche `v22.12.0` ou plus. Sans nvm, installez une Node 22 LTS depuis nodejs.org.

<!-- step: npm-ci -->
3. **Installez les dépendances** exactement comme le dit le fichier de verrouillage.

   ```sh
   # dans le dépôt du moteur
   npm ci
   ```

   La commande se termine sans erreur et crée `node_modules/`. Utilisez `npm ci`, pas `npm install` : le fichier de
   verrouillage fait partie de ce que la CI vérifie.

<!-- step: python -->
4. **Installez les modules Python d'image.**

   ```sh
   # dans le dépôt du moteur
   python3 -m pip install --require-hashes -r requirements.txt
   ```

   Un environnement virtuel convient aussi ; les outils appellent `python3`, activez-le donc avant de les lancer.

<!-- step: playwright -->
5. **Installez un navigateur pour les tests de bout en bout.**

   ```sh
   # dans le dépôt du moteur
   npx playwright install chromium
   ```

   Chromium est obligatoire (les e2e et les vérifications du Studio s'en servent). WebKit et Firefox sont facultatifs :
   `npx playwright install webkit firefox` les ajoute, pour les lignes que la CI lance dans ces navigateurs.

<!-- step: doctor -->
6. **Consultez le docteur.**

   ```sh
   # dans le dépôt du moteur
   npm run doctor
   ```

   Chaque ligne est `✔` (présent), `○` (facultatif et absent) ou `✖` (obligatoire et absent), avec la commande qui
   corrige, par exemple `Run: python3 -m pip install --require-hashes -r requirements.txt` ou
   `Run: npx playwright install chromium`. Il
   vérifie Node (version majeure 22 ou plus), Python 3, les modules d'image, ffmpeg, les trois navigateurs de
   Playwright, et Ed25519 et Biscuit pour le Reality Bridge. Seul un élément obligatoire fait échouer le rapport :
   Python, ffmpeg, WebKit et Firefox sont facultatifs au quotidien. `npm run doctor -- --release` rend obligatoires
   Python, ses modules et ffmpeg, dont `npm run release-check` a besoin. Le docteur n'installe jamais rien.

<!-- step: first-run -->
7. **Lancez la suite unitaire et le jeu d'exemple.**

   ```sh
   # dans le dépôt du moteur
   npm test
   npm run dev
   ```

   `npm test` lance la suite unitaire (`test:node` : tous les fichiers de test sauf les tests lourds du solveur et les
   deux tests d'assets). `npm run dev` sert le jeu d'exemple, « The Pantry Key », sur `http://localhost:5173/` :
   ouvrez-le dans une fenêtre de la taille d'un téléphone.

<!-- step: game -->
8. **Choisissez un autre jeu** quand il le faut. Le jeu courant est, dans cet ordre : la variable d'environnement
   `GAME`, le jeu vers lequel pointe le lien `.cache/game`, `"config": { "game" }` de `package.json`, puis `demo`.

   ```sh
   # dans le dépôt du moteur
   GAME=reference npm run dev        # pour cette commande seulement
   GAME=heroes npm run game          # déplace le lien .cache/game : les commandes suivantes utilisent heroes
   GAME=demo npm run game            # retour au jeu d'exemple
   ```

   Les jeux fournis sont `demo`, `reference` (« The Night Market »), `heroes`, `signals` et `_template` (le modèle que
   copie `npm run new-game`). `npm run dev`, `npm run check` et `npm run build` lancent d'abord `npm run game` : le lien
   suit donc `GAME` quand elle est définie.

> [!LIMIT id=windows-posix]
> Sous Windows, la suite unitaire tourne sans les quelques fichiers de test qui supposent POSIX (droits de fichiers,
> `/` dans les chemins, outils du shell, tests Telnet et SSH des connecteurs, worker de traitement du Studio Server) :
> le job `windows` de la CI les nomme. Voir [Prérequis](install.requirements.md).

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Les outils du dépôt sont des scripts npm ; [Scripts npm](reference.npm-scripts.md) les liste tous.
- `npm run doctor` dit ce qui manque et comment le corriger : [`doctor`](install.doctor.md).
- Le jeu courant se choisit par `GAME`, un lien, puis `package.json`.

<a name="next"></a>

## Pour aller plus loin

- [La boucle de développement](contribute.dev-loop.md) : changer, vérifier, regarder.
- [Architecture](contribute.architecture.md) et la [Visite du code](contribute.code-tour.md).
- [Avant une pull request](contribute.before-a-pr.md).
