# Installer depuis le dépôt pour travailler sur le moteur

Pour modifier le moteur lui-même, ses outils ou son Studio, ou pour jouer ses jeux d'exemple depuis les sources, on
travaille dans un clone du dépôt du moteur. Pour faire votre propre jeu, vous n'en avez pas besoin :
[Installer depuis l'archive de la release](install.from-archive.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un clone de `Quest-n-Click/quest-n-click` avec ses dépendances de développement, les modules Python et Chromium installés,
vérifié par `npm run doctor`, et le jeu d'exemple qui tourne avec `npm run dev`.

<a name="context-and-versions"></a>

## Contexte et versions

- Le **dépôt du moteur**, sur votre machine. Chaque commande se lance à la racine du clone.
- `main` contient du travail pas encore publié. Pour travailler sur une version publiée, prenez son tag
  (`git checkout v4.4.0`).
- Le dépôt est `github.com/Quest-n-Click/quest-n-click` depuis la 4.5.2 ; les adresses précédentes,
  `github.com/wanoo/quest-n-click` (de la 4.2.5 à la 4.5.1) et `github.com/wanoo/web-scumm`, redirigent vers lui.
- L'installation complète d'un contributeur, avec les conventions et les vérifications avant une pull request, est
  [Préparer sa machine de développement](contribute.setup.md) ; cette page ne couvre que l'installation.

<a name="prerequisites"></a>

## Prérequis

- git, et Node.js 22.12 ou plus récent (22.13 pour le Studio local et les outils d'écriture) ; `nvm` lit le `.nvmrc`
  du dépôt ([Prérequis](install.requirements.md#node)).
- Python 3 ([Prérequis](install.requirements.md#python)).
- Optionnel : ffmpeg, pour les sons et le pipeline audio ([Prérequis](install.requirements.md#ffmpeg)).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dossier qui accueillera le clone, puis à la racine du clone. Sous Windows, dans Git Bash.

<a name="steps"></a>

## Étapes

<!-- step: clone -->
1. Clonez le dépôt et entrez-y :

   ```bash
   # dans le dossier qui accueillera le clone
   git clone https://github.com/Quest-n-Click/quest-n-click.git
   cd quest-n-click
   ```

<!-- step: node-version -->
2. Prenez la version de Node que nomme le dépôt (`.nvmrc` dit `22` : la Node 22 la plus récente que vous avez) :

   ```bash
   # à la racine du clone
   nvm use
   node --version        # v22.12.0 ou plus récent
   ```

<!-- step: npm-ci -->
3. Installez les dépendances exactes de `package-lock.json`, outils de développement compris (Playwright, Vitest,
   Biome) :

   ```bash
   # à la racine du clone
   npm ci
   ```

<!-- step: python-modules -->
4. Installez les modules Python épinglés (Pillow, NumPy, SciPy) :

   ```bash
   # à la racine du clone
   python3 -m pip install --require-hashes -r requirements.txt
   ```

<!-- step: chromium -->
5. Installez le navigateur que pilotent les scripts e2e et les vérifications du Studio :

   ```bash
   # à la racine du clone
   npx playwright install chromium
   ```

   `npx playwright install webkit firefox` ajoute les deux navigateurs optionnels.

<!-- step: doctor -->
6. Vérifiez la machine :

   ```bash
   # à la racine du clone
   npm run doctor
   ```

<!-- step: run-demo -->
7. Lancez le jeu d'exemple. Le jeu est choisi par `GAME`, sinon par le jeu vers lequel pointe `.cache/game`
   (`npm run game` crée le lien), sinon par `config.game` dans `package.json`, qui vaut `demo` :

   ```bash
   # à la racine du clone
   npm run dev                 # le jeu d'exemple, games/demo
   GAME=heroes npm run dev     # un autre jeu de games/
   ```

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run doctor` se termine par `Development, asset and browser-test prerequisites are ready.` (ou dit quel prérequis
optionnel manque, et sort quand même avec 0) ; voir [doctor](install.doctor.md). `npm run dev` affiche une URL locale
qui ouvre le jeu d'exemple. Les vérifications à lancer avant une modification sont dans
[Avant une pull request](contribute.before-a-pr.md).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm ci` refuse : le verrou et `package.json` ne concordent pas | Une modification locale de `package.json` | `git checkout package.json package-lock.json`, ou `npm install` si la modification était voulue |
| `✖  Playwright Chromium: browser binary missing` | Étape 5 pas faite | `npx playwright install chromium` |
| `error: externally-managed-environment` de pip | Le Python du système refuse les installations globales (PEP 668) | Passez par un environnement virtuel : `python3 -m venv .venv && . .venv/bin/activate`, puis l'étape 4 |
| `✖  games/<id>/index.ts not found (GAME=<id>)` | `GAME` ne nomme aucun dossier de `games/` | `ls games` et choisissez un id existant |

[Dépannage de l'installation](install.troubleshooting.md) en dit plus.

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le clone ; `node_modules/` ; les navigateurs de Playwright dans son dossier de cache (hors du clone, partagé par tous
les projets) ; les modules Python dans votre environnement Python ; `.cache/` dans le clone (le lien du jeu, le journal
des outils d'écriture, des caches), ignoré par git.

<a name="recovery"></a>

## Reprise ou retour arrière

Supprimez le clone. Les navigateurs de Playwright restent dans son cache jusqu'à `npx playwright uninstall --all`.

<a name="references"></a>

## Références

- [Préparer sa machine de développement](contribute.setup.md), [Boucle de développement](contribute.dev-loop.md),
  [Avant une pull request](contribute.before-a-pr.md)
- [Prérequis](install.requirements.md), [doctor](install.doctor.md)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`tools/select-game.ts`](../../tools/select-game.ts) (comment le jeu est choisi)
