# Installer depuis l'archive de la release

Le moteur est sur npm depuis la 4.5.2 ([Installer depuis npm](install.from-npm.md)). Chaque release
GitHub le joint aussi sous forme d'archive, `quest-n-click-<version>.tgz`, et cette archive crée et fait tourner un jeu
de la même façon, sans le registre.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un projet de jeu à vous, hors du dépôt du moteur : un lieu, un héros et des images provisoires, le moteur installé
depuis l'archive de la release sous `node_modules/@quest-n-click/engine`, jouable dans votre navigateur avec `npm run dev`.

<a name="context-and-versions"></a>

## Contexte et versions

- Un **projet créé**, sur votre machine. Rien ici ne demande un clone du dépôt du moteur.
- Depuis la 4.2.5, les fichiers de la release s'appellent `quest-n-click-…`. Avant la 4.2.5, c'était `web-scumm-…`
  ([Venir de web-scumm](install.from-web-scumm.md)).
- Les commandes ci-dessous sont le démarrage rapide du README. Chaque candidat de release les lance comme un lecteur
  les copie, dans un dossier vide hors du dépôt, sur sa propre archive (`scripts/readme-quickstart.mjs`) ; après le
  tag, `--published` vérifie que l'URL répond et que ses octets correspondent au `SHA256SUMS` de la release.

<a name="prerequisites"></a>

## Prérequis

- Node.js 22.12 ou plus récent ; 22.13 si vous utiliserez le Studio local ([Prérequis](install.requirements.md#node)).
- Python 3, pour préparer les images avec `npm run assets` ([Prérequis](install.requirements.md#python)).
- ffmpeg est optionnel : il convertit les sons et les vidéos ([Prérequis](install.requirements.md#ffmpeg)).
- Une version de release : prenez la dernière, sur <https://github.com/Quest-n-Click/quest-n-click/releases/latest>. Les
  commandes et les sorties de cette page ont été jouées avec la 4.4.0, une release passée : mettez la dernière version
  à sa place.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans un terminal, depuis le dossier qui **contiendra** le nouveau projet (`create` crée lui-même le
dossier du projet). Toutes les commandes après `cd my-game` tournent dans le projet créé. Sous Windows, utilisez Git
Bash.

<a name="steps"></a>

## Étapes

<!-- step: set-archive-url -->
1. Nommez l'archive de la release voulue. Le modèle d'URL est
   `https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz` :

   ```bash
   # dans le dossier qui contiendra le projet
   T=https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

<!-- step: create-project -->
2. Créez le projet depuis cette archive. `--package=$T` lance la commande `quest-n-click` de l'archive ; `--engine=$T`
   inscrit la même archive comme dépendance du projet :

   ```bash
   # dans le dossier qui contiendra le projet
   npx --package=$T quest-n-click create my-game "Mon jeu" --engine=$T
   ```

   `create <dossier> ["Titre"]` refuse un dossier qui existe et n'est pas vide. L'id du jeu est le nom du dossier en
   minuscules, mots séparés par des tirets ; le titre vaut ce nom par défaut.

<!-- step: npm-install -->
3. Installez le moteur dans le projet :

   ```bash
   cd my-game
   npm install
   ```

<!-- step: python-modules -->
4. Installez les modules Python dont les outils d'images ont besoin, depuis le fichier que porte le paquet du moteur :

   ```bash
   # dans le projet créé
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   ```

<!-- step: assets-and-dev -->
5. Préparez les images, puis jouez :

   ```bash
   # dans le projet créé
   npm run assets && npm run dev
   ```

   Ouvrez l'URL qu'affiche `dev`. En paysage sur un téléphone, le jeu se joue comme pour les joueurs (le serveur de
   développement n'écoute que sur votre machine ; [Tester sur un téléphone du réseau](create.lan-testing.md) l'ouvre
   au réseau local). `?edit=start` dans l'URL ouvre l'éditeur de placement sur le lieu `start`.

<!-- step: verify-and-build -->
6. Quand vous avez changé quelque chose, vérifiez le jeu et construisez-le :

   ```bash
   # dans le projet créé
   npm run verify
   npm run build
   ```

   `npm run build` écrit `dist/`, un site statique que n'importe quel hébergement sert
   ([Construire et publier](create.build-release.md)).

Pour vérifier l'archive avant de la lancer, téléchargez-la avec les sommes de la release et installez depuis le
fichier :

```bash
# dans le dossier qui contiendra le projet
gh release download v4.4.0 --repo Quest-n-Click/quest-n-click -p 'quest-n-click-4.4.0.tgz' -p 'quest-n-click-v4.4.0-SHA256SUMS'
shasum -a 256 -c --ignore-missing quest-n-click-v4.4.0-SHA256SUMS
npx --package=./quest-n-click-4.4.0.tgz quest-n-click create my-game "Mon jeu" --engine=file:../quest-n-click-4.4.0.tgz
```

Le chemin `file:` se lit depuis le dossier du projet, d'où le `../`. `shasum` affiche `quest-n-click-4.4.0.tgz: OK`
quand les octets sont ceux que liste la release (vérifié le 23 octobre 2026 avec la v4.4.0).

> [!LIMIT id=sums-are-not-provenance]
> Une somme qui correspond dit que le fichier est celui que liste la release, pas qui a fait la release. Les
> attestations de la release et `ship verify` répondent à cette question ; elles sont décrites dans
> [Publier une release](contribute.releasing.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`create` se termine par :

```text
my-game: "Mon jeu" created (quest-n-click https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz).
Next:
  cd my-game
  npm install
  npm run assets && npm run dev
```

Dans le projet, `npx quest-n-click help` affiche `quest-n-click 4.4.0: an engine for point-and-click games in the
browser` et la liste des commandes. `npm run dev` montre le lieu du modèle avec son héros ; `npm run verify` se termine
sans erreur (validation, solveur, état des traductions, lint, playtests).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click` à `npm install` | Le projet a été créé sans `--engine=$T` : sa dépendance vaut `^<version>`, cherchée sur npm, où le moteur n'est pas publié | Recréez-le avec `--engine=$T`, ou lancez `npm install $T` dans le projet |
| `my-game exists and is not empty` | `create` n'écrit jamais dans un dossier qui contient des fichiers | Choisissez un autre nom de dossier, ou videz-le |
| `npm warn EBADENGINE Unsupported engine` | Node plus ancien que 22.12 | Installez Node 22.12 ou plus récent ([Prérequis](install.requirements.md#node)) |
| `npm run assets` échoue sur `import PIL` | Les modules Python manquent | Étape 4 |
| `warning: missing images: …` après `assets` | Le contenu cite une image dont le fichier n'est pas dans `game/art` | Ajoutez le fichier, ou corrigez le nom ([Images](create.images.md)) |
| `npx quest-n-click doctor` s'arrête sur `Cannot find package 'playwright'` | `doctor` importe Playwright, que le paquet du moteur n'apporte pas | [Dépannage de l'installation](install.troubleshooting.md#doctor-in-created-project) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`create` n'écrit que le nouveau dossier :

| Chemin | Quoi |
|---|---|
| `game/` | le jeu : `game.ts`, `rooms/`, `cast.ts`, `items.ts`, `rules.ts`, `layout/`, `locales/`, `art/`, `audio/`, `provenance.json` |
| `public/` | les icônes de la page, son image d'aperçu, la police complète ; `public/assets` est écrit par `npm run assets` (pas commité) |
| `dist/` | le build, avec `licenses/` (`npm run build`) |
| `package.json` | les scripts `dev`, `studio`, `assets`, `verify`, `build`, `release`, `preview`, qui appellent chacun `quest-n-click`, et le moteur comme seule dépendance |
| `tsconfig.json` | `@engine/*` pointe dans `node_modules/@quest-n-click/engine/src/engine`, `@quest-n-click/engine/*` dans son API publique |
| `.gitignore`, `README.md` | `node_modules`, `dist`, `.cache`, `public/assets` ignorés ; les commandes ci-dessus |

Les images du modèle sont provisoires, dessinées à partir de formes (`tools/placeholder-art.py`) : `game/provenance.json`
le dit, et `npm run release` les refuse tant que chaque fichier n'est pas remplacé et revu
(`npx quest-n-click provenance --lock`). L'organisation complète d'un projet est dans
[Organisation d'un projet](create.project-layout.md).

`npm install` ajoute `node_modules/` et `package-lock.json` ; `npm run assets` écrit `public/assets/` et `.cache/`, et
met à jour `game/assets.gen.json` (les tailles en pixels des images préparées). Les commandes tournent avec le projet
comme dossier de travail ([`WEB_SCUMM_PROJECT`](reference.environment-variables.md#web-scumm-project)) : le moteur dans
`node_modules/@quest-n-click/engine` est lu, jamais écrit. Hors du projet, seuls le cache de npm et les modules Python de
l'étape 4 changent.

<a name="recovery"></a>

## Reprise ou retour arrière

Supprimez le dossier du projet : rien d'autre n'a été écrit pour lui. Pour changer de version du moteur plus tard,
voir [Mettre à jour](install.upgrade.md).

<a name="other-archives"></a>
<!-- applies: 4.2.5.. since 4.2.1 -->

## Les autres archives d'une release

Une release joint cinq archives npm, toutes à la même version (la liste de la v4.4.0, lue le 23 octobre 2026) :
`quest-n-click-<version>.tgz` (le moteur), `create-quest-n-click-<version>.tgz` (`npm init @quest-n-click`, une fois
sur npm), `quest-n-click-bridge-<version>.tgz` (le Reality Bridge de référence, [Installer et lancer le Bridge](bridge.install-run.md)), `quest-n-click-connectors-<version>.tgz` (les connecteurs, ceux d'un opérateur,
jamais d'un jeu) et, depuis la 4.2.1, `quest-n-click-studio-server-<version>.tgz`. Le contenu de chacune est dans la
[Référence du paquet](install.package.md).

L'archive du Studio Server contient les deux commandes `quest-n-click-studio-server` et `quest-n-click-studio-worker`,
la page du Studio déjà construite, et ses propres dépendances (OpenID Connect, JWT, Postgres). Leurs versions sont
verrouillées dans son `npm-shrinkwrap.json` et son SBOM ; npm lit ce verrou quand il installe depuis le registre, pas
depuis un fichier d'archive, où `pg` prend le dernier 8.x que permet sa plage (`quest-n-click-studio-server deps` dit
lequel). Elle fait tourner le serveur du moteur installé à côté, qui doit être de la même version :

```sh
# sur la machine du serveur, dans un dossier vide pour l'installation
npm install quest-n-click-<version>.tgz quest-n-click-studio-server-<version>.tgz
npx quest-n-click-studio-server import ./my-game --config studio.config.json
npx quest-n-click-studio-server serve --config studio.config.json
npx quest-n-click-studio-worker          # sur la machine du worker, avec WORKER_PUBLIC_KEY et WORKER_INSTANCE
```

Un worker installé depuis les archives prépare aussi les assets (depuis la 4.2.3) : son hook de build installe le
`requirements.txt` à empreintes que porte le paquet du moteur, depuis le dossier du worker, où le worker cherche les
paquets ([`WORKER_PYTHON_PATH`](reference.environment-variables.md#worker-python-path) pour les mettre ailleurs) :
`CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
node_modules/@quest-n-click/engine/requirements.txt`. Ses empreintes couvrent les roues de toutes les
plateformes que publie PyPI, dont le runtime natif de Clever Cloud (CPython 3.13, Linux x86_64) ; avant la 4.5.2, le
hook nommait `ops/studio/worker-requirements.lock`, qui n'existe plus. En 4.2.2, il fallait un worker déployé depuis
le dépôt.

L'archive du moteur apporte Vite et tsx, dont le worker a besoin pour exécuter le code du jeu et construire ses
prévisualisations (le Studio lui-même ne fait plus tourner Vite, depuis la 4.2.2). Mettez dans `publicDir` les assets
préparés de votre jeu (`public/` de son dépôt) : celui du moteur ne contient que ses icônes et sa police. Le candidat
de chaque release installe ces deux archives dans un dossier vide et y sert un jeu, ses dépendances trouvées que npm
les remonte ou les imbrique (`scripts/studio-install-smoke.mjs`). Le déploiement est décrit dans
[Premier déploiement sur Clever Cloud](clever.first-deployment.md).

<a name="references"></a>

## Références

- [Prérequis](install.requirements.md), [Référence du paquet](install.package.md), [Mettre à jour](install.upgrade.md)
- [Votre premier jeu](create.first-game.md), [Jouer en ligne](start.play-online.md)
- [`cli/create.mjs`](../../cli/create.mjs) (ce qu'écrit `create`), [`scripts/readme-quickstart.mjs`](../../scripts/readme-quickstart.mjs)
  (le démarrage rapide rejoué par chaque candidat)
