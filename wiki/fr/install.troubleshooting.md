# Dépannage de l'installation

Ce qui coince quand on installe le moteur, qu'on crée un projet ou qu'on vérifie sa machine, de ce que l'on voit
jusqu'à la correction. Chaque section dit où cela arrive : dans un **projet créé** ou dans le **dépôt du moteur**.

<a name="doctor-in-created-project"></a>

## `doctor` échoue dans un projet créé

**Symptôme.** Dans un projet créé, `npx quest-n-click doctor` n'affiche aucun rapport et s'arrête sur :

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from …/node_modules/@quest-n-click/engine/tools/doctor.ts
```

**Cause.** `doctor` importe Playwright pour trouver les navigateurs. Le paquet du moteur laisse Playwright hors de ses
dépendances (`scripts/pack.mjs` : les tests et Playwright restent dehors) : un projet créé ne l'a donc jamais.
Constaté le 23 octobre 2026 avec un projet créé depuis l'archive de la v4.4.0 ; `main` a le même code. Votre projet
n'est pas cassé : rien d'autre dedans ne se sert de Playwright.

**Correction.** Soit vous donnez à `doctor` ce qu'il importe, soit vous vérifiez les prérequis à la main.

<!-- step: install-playwright -->
1. Dans le projet créé, installez Playwright en dépendance de développement, à la plage du dépôt du moteur :

   ```bash
   # dans le projet créé
   npm install --save-dev playwright@^1.64.1
   ```

<!-- step: install-chromium -->
2. `doctor` exige Chromium, même si un projet créé ne l'ouvre jamais. S'il affiche `✖  Playwright Chromium: browser
   binary missing`, installez-le :

   ```bash
   # dans le projet créé
   npx playwright install chromium
   ```

<!-- step: run-doctor -->
3. Relancez `doctor` :

   ```bash
   # dans le projet créé
   npx quest-n-click doctor
   ```

   Il se termine par `Development, asset and browser-test prerequisites are ready.`, ou nomme ce qui manque.

<!-- step: check-by-hand -->
4. Ou, à la place des étapes 1 à 3, vérifiez à la main ce dont un projet créé a besoin :

   ```bash
   # dans le projet créé
   node --version                               # v22.12.0 ou plus récent (22.13 pour le Studio local)
   python3 -c "import PIL, numpy, scipy"        # aucune sortie : les outils d'images tourneront
   ffmpeg -version                              # seulement si le jeu a des sons ou des vidéos
   ```

> [!LIMIT id=doctor-created-project-workaround]
> Le contournement ajoute Playwright, et un navigateur si `doctor` en demande un, à un projet qui ne s'en sert pas par
> ailleurs. Retirez-les ensuite avec `npm uninstall playwright` et `npx playwright uninstall --all` si vous préférez.

<a name="npm-404"></a>

## `npm install` répond 404

**Symptôme.** `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click - Not found`, à `npm install`
dans un projet créé, ou à `npm init @quest-n-click`.

**Cause.** Le moteur n'est pas sur npm (vérifié le 23 octobre 2026). Un projet créé sans `--engine=<URL de l'archive>`
dépend de `^<version>`, que npm cherche dans le registre.

**Correction.** Dans le projet créé, installez l'archive : `npm install
https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz`. Pour un nouveau
projet, passez `--engine=$T` : [Installer depuis l'archive de la release](install.from-archive.md).

<a name="node-version"></a>

## Node est trop ancien

**Symptôme.** `npm warn EBADENGINE Unsupported engine` à l'installation, puis des erreurs de Vite ou des outils ; ou,
depuis la 4.2.1, le Studio local ou un outil d'écriture (`ids`, `i18n`, `voices`, `import-layout`, `provenance`)
s'arrête sur `node:sqlite`.

**Cause.** Le moteur demande Node 22.12 ; le Studio et les outils d'écriture demandent 22.13, où `node:sqlite` est
disponible sans option. `doctor` ne le voit pas : il ne vérifie que la version majeure.

**Correction.** Installez Node 22.13 ou plus récent (`nvm install 22`), puis `node --version`.

<a name="python-modules"></a>

## Les outils d'images n'importent pas Pillow, NumPy ou SciPy

**Symptôme.** `npm run assets` ou `tools/cut-sheet.py` s'arrête sur `ModuleNotFoundError: No module named 'PIL'` (ou
`numpy`, `scipy`) ; `doctor` dit `○  Python image modules: Pillow, NumPy and/or SciPy missing (optional)`.

**Cause.** Les modules ne sont pas installés pour le `python3` que lancent les outils.

**Correction.** Dans le dépôt du moteur, `python3 -m pip install --require-hashes -r requirements.txt` ;
dans un projet créé, `python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt`.
Si pip répond
`error: externally-managed-environment` (un Python du système, PEP 668), créez d'abord un environnement virtuel
(`python3 -m venv .venv && . .venv/bin/activate`) ; dans un projet créé, `PYTHON=.venv/bin/python npm run assets`
l'utilise ensuite.

<a name="chromium-missing"></a>

## `doctor` dit que Chromium manque

**Symptôme.** `✖  Playwright Chromium: browser binary missing`, puis `1 prerequisite missing.`, code de retour 1.

**Cause.** Dans le dépôt du moteur, `npx playwright install chromium` n'a pas été lancé (ou l'a été pour une autre
version de Playwright, avant une mise à jour des dépendances).

**Correction.** Dans le dépôt du moteur, `npx playwright install chromium`. Un Firefox ou un WebKit absent est
optionnel (`○`) et ne fait pas échouer `doctor`.

<a name="ffmpeg-missing"></a>

## Pas de son dans les assets préparés

**Symptôme.** `doctor` affiche `○  ffmpeg: not found (optional)` ; `npm run assets` s'arrête quand il arrive à un son
ou à une vidéo.

**Cause.** `assets` convertit la musique, les bruitages et les vidéos avec ffmpeg.

**Correction.** Installez ffmpeg (`brew install ffmpeg`, ou le paquet de votre système). `npm run doctor -- --release`
l'exige.

<a name="create-not-empty"></a>

## `create` refuse le dossier

**Symptôme.** `my-game exists and is not empty`.

**Cause.** `create` n'écrit jamais dans un dossier qui contient des fichiers.

**Correction.** Donnez un autre nom de dossier, ou videz celui-là.

<a name="former-name"></a>

## Un import de `web-scumm/…` ne se résout plus

**Symptôme.** Après l'installation de la 4.3.0 ou d'une version plus récente, le jeu ne se construit plus : un import
de `web-scumm/content` (ou d'un autre `web-scumm/…`) est introuvable ; `npx web-scumm` n'est pas une commande.

**Cause.** Les alias de l'ancien nom ont été retirés en 4.3.0.

**Correction.** Dans le projet créé, `npx quest-n-click migrate`, puis `npm install` :
[Venir de web-scumm](install.from-web-scumm.md).

<a name="furnace-windows"></a>

## `npm run audio -- setup` s'arrête sous Windows

**Symptôme.** `mdpipe: install Furnace 0.6.8.3 yourself on Windows and put its executable in …`.

**Cause.** La chaîne ne télécharge Furnace que sous macOS et Linux.

**Correction.** Installez vous-même Furnace 0.6.8.3, puis mettez son exécutable dans `tools/audio/.furnace/` ou
nommez-le avec `FURNACE_BIN` : [Outils audio](install.audio-toolchain.md#furnace).

<a name="neighbours"></a>

## Cas voisins

- Le Reality Bridge a son propre `doctor` (`npx quest-n-click-bridge doctor`), qui porte sur son journal et son
  stockage, pas sur votre machine : [Dépannage du Bridge et des connecteurs](bridge.troubleshooting.md).
- Un jeu qui s'installe mais ne se joue pas comme prévu : [Dépannage côté joueur](play.troubleshooting.md).
- Un déploiement qui échoue : [Problèmes de déploiement](create.deploy-issues.md) ; un Studio hébergé :
  [Dépannage Clever](clever.troubleshooting.md).
