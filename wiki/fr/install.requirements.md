# Prérequis

Ce qu'il faut sur une machine pour faire un jeu avec quest'n'click, ou pour travailler sur le moteur. Deux contextes
reviennent sur cette page : un **projet créé** (un jeu fait avec `quest-n-click create`, le moteur installé sous
`node_modules/@quest-n-click/engine`) et le **dépôt du moteur** (un clone de `Quest-n-Click/quest-n-click`). Seul Node.js sert à tout ;
le reste dépend de ce que vous faites.

| Outil | Sert à | Projet créé | Dépôt du moteur |
|---|---|---|---|
| Node.js 22.12 ou plus récent | tout | requis | requis |
| Node.js 22.13 ou plus récent | le Studio local, les outils qui écrivent un jeu, un Bridge sur SQLite | si vous vous en servez | si vous vous en servez |
| Python 3 et `requirements.txt` | `npm run assets` (les images), les outils d'images | requis pour préparer les images | requis pour `assets` et les tests d'assets |
| ffmpeg | les sons et vidéos dans `assets`, le pipeline audio | optionnel | optionnel (requis par `doctor -- --release`) |
| Playwright Chromium | les tests navigateur, les vérifications du Studio, `doctor` | inutilisé, mais `doctor` a besoin de Playwright (voir plus bas) | requis |
| Playwright WebKit, Firefox | les navigateurs secondaires des e2e | inutilisés | optionnels |
| fluidsynth, Furnace, `uv` | le pipeline audio Mega Drive | non proposé | optionnels |

`doctor` vérifie l'essentiel à votre place : [doctor : vérifier sa machine](install.doctor.md).

<a name="node"></a>

## Node.js

### Version

**22.12 ou plus récent.** Le `package.json` du moteur dit `"engines": { "node": ">=22.12" }`, et le paquet
`@quest-n-click/engine` porte le même champ : Vite 8 et Vitest 5 l'exigent (4.1.8). Le `.nvmrc` du dépôt dit `22` : `nvm use`
prend donc la 22 la plus récente que vous avez installée.

### Node 22.13 pour le Studio, les outils d'écriture et SQLite

Depuis la 4.2.1, le Studio local et les outils qui écrivent un jeu (`ids`, `i18n`, `voices`, `import-layout`,
`provenance`, les modifications du Studio lui-même) écrivent à travers un journal tenu sous `.cache/studio-journal/`
en SQLite, via `node:sqlite`, qui demande **Node 22.13 ou plus récent**. Un Reality Bridge sur son profil `local`
(SQLite) le demande aussi. Jouer et construire un jeu tournent toujours en 22.12.

### Vérifié par

La CI fait tourner Node 22 et 24 sous Ubuntu, et installe les archives de la release sous Ubuntu, macOS et Windows avec
Node 22 (et sous Ubuntu avec Node 24), dans le job `external-consumer` du candidat.

> [!LIMIT id=doctor-node-major]
> `doctor` vérifie seulement que la version majeure de Node vaut 22 ou plus : il laisse passer Node 22.0 à 22.11, que le
> moteur ne prend pas en charge. Lisez `node --version` vous-même. npm affiche un avertissement `EBADENGINE`, pas une
> erreur, quand vous installez le moteur sur un Node plus ancien.

<a name="python"></a>

## Python 3 et ses modules

### Sert à

`npm run assets` (`tools/assets.py`) prépare les images qu'un jeu cite, et les outils d'images (`tools/cut-sheet.py`,
les outils de bouches qui parlent) découpent et corrigent les planches : tout cela est en Python. Sans Python, un jeu
se joue encore avec des assets déjà préparés, et `doctor` dit Python optionnel.

### Version

`requirements.txt` épingle les modules : Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1 (Pillow est passé en 13.0.0 avec la
4.3.0), chacun avec le sha256 de chaque fichier que PyPI publie pour lui : pip vérifie ce qu'il télécharge (depuis
la 4.5.2). La CI utilise Python 3.12. Aucune autre version de Python n'est vérifiée.

### Installer

```sh
# dans le dépôt du moteur
python3 -m pip install --require-hashes -r requirements.txt
```

```sh
# dans un projet créé : le fichier vient avec le paquet du moteur
python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
```

Dans un projet créé, `npx quest-n-click assets` lance `python3`, ou l'interpréteur que nomme la variable
[`PYTHON`](reference.environment-variables.md#python) (celui d'un environnement virtuel, par exemple). Dans le dépôt du
moteur, `npm run assets` appelle toujours `python3`.

> [!LIMIT id=opencv-not-pinned]
> Les outils de bouches qui parlent (`tools/talk-apply.py`, `tools/talk-normalize.py`) importent aussi OpenCV (`cv2`),
> que `requirements.txt` ne liste pas et que `doctor` ne vérifie pas. Installez-le vous-même si vous vous en servez.

Les outils d'images sont décrits dans [Outils pour les images](install.image-toolchain.md).

<a name="ffmpeg"></a>

## ffmpeg

### Sert à

`assets` convertit la musique, les bruitages et les vidéos avec ffmpeg ; le pipeline audio (`npm run audio`) fait son
rendu et son encodage avec lui. Un jeu sans son ni vidéo à convertir ne l'appelle jamais. `doctor` le dit optionnel ;
`npm run doctor -- --release` (la vérification de release du dépôt du moteur) l'exige.

### Installer

N'importe quelle version récente dans votre `PATH` : `brew install ffmpeg` sous macOS, le paquet de votre distribution
sous Linux. La CI l'installe avec `scripts/ci-ffmpeg.sh`.

<a name="playwright"></a>

## Les navigateurs de Playwright

### Sert à

Dans le dépôt du moteur, les scripts e2e et les vérifications du Studio pilotent Chromium via Playwright, une
dépendance de développement. `doctor` y exige Chromium, et dit Firefox et WebKit optionnels.

```sh
# dans le dépôt du moteur, après npm ci
npx playwright install chromium
```

### Dans un projet créé

Aucune commande de `quest-n-click` n'ouvre de navigateur via Playwright, et le paquet du moteur n'en dépend pas. Seul
`doctor` l'importe : `npx quest-n-click doctor` s'arrête donc sur un module `playwright` introuvable dans un projet
neuf. [Dépannage de l'installation](install.troubleshooting.md#doctor-in-created-project) donne le contournement.

<a name="audio-tools"></a>

## Les outils du pipeline audio

fluidsynth, Furnace 0.6.8.3 (téléchargé par `npm run audio -- setup` sous macOS et Linux) et, pour les sources audio,
`uv` avec un environnement virtuel Python 3.11. Ils ne servent qu'au `npm run audio` du dépôt du moteur :
[Outils audio](install.audio-toolchain.md).

<a name="systems"></a>

## Windows, macOS, Linux

- **Linux et macOS** : chaque commande de ces pages tourne telle qu'écrite. Le mainteneur travaille sous macOS ; la CI
  tourne sous Ubuntu.
- **Windows** : la CI a un job `windows-latest` (depuis la 4.1.8) : `doctor`, les vérifications de types, la suite
  unitaire sauf six fichiers de tests qui supposent POSIX (droits de fichiers, `/` dans les chemins ; nommés dans
  `ci.yml`), sans les tests Telnet et SSH ni l'application de traitement du Studio Server, puis `build` et le serveur de
  production qui répond. Chaque candidat de release
  installe les archives sous Windows, crée et construit un jeu, et le joue jusqu'à sa fin via `@quest-n-click/engine/testing`
  (sans navigateur). Personne n'a encore vérifié `npm run dev` ni le Studio sous Windows. Lancez les blocs shell de
  ces pages dans Git Bash, le shell qu'utilise la CI là-bas.
- Le pipeline audio ne télécharge pas Furnace sous Windows : installez-le vous-même
  ([Outils audio](install.audio-toolchain.md#furnace)).
- L'application de traitement d'un Studio hébergé et ses prévisualisations ne tournent que sous Linux.

La matrice de support, avec ce que des personnes ont vérifié ou pas, est la [Matrice de support](reference.support-matrix.md).

<a name="related"></a>

## Voir aussi

- [doctor : vérifier sa machine](install.doctor.md)
- [Installer depuis l'archive de la release](install.from-archive.md)
- [Installer depuis le dépôt pour travailler sur le moteur](install.from-repository.md)
- [Variables d'environnement](reference.environment-variables.md) : `PYTHON`, `FURNACE_BIN`
