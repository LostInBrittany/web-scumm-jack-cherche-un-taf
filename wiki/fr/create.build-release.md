# Construire et publier un jeu

`npm run build` fait d'un jeu un dossier statique, `dist/`, que n'importe quel hébergeur web sait servir : le jeu, ses
assets, son service worker et ses licences. Une construction de release ajoute les contrôles qu'un jeu doit passer
avant que des gens y jouent : provenance verrouillée, budgets, traductions, voix, playtests et preuve exhaustive. Cette
page dit ce que vérifie chaque commande, dans quel dossier elle se lance, et quoi regarder avant d'envoyer le lien.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un dossier `dist/`, vérifié fichier par fichier, prêt à téléverser : une application web installable (PWA) qui se joue
hors ligne après la première visite, dont chaque fichier est recensé avec sa licence dans `dist/licenses/`.

<a name="context-and-versions"></a>

## Contexte et versions

Le même jeu se construit à deux endroits, avec des commandes différentes :

| | Projet créé (`quest-n-click create`) | Dépôt du moteur (`games/<id>/`) |
|---|---|---|
| Construction courante | `npm run build` | `npm run build` |
| Construction de release | `npm run release` | `npm run verify:release` après `npm run build` |
| Release qui peut être vendue | `npm run release -- --commercial` | `npm run verify:commercial` |
| Preuve exhaustive | comprise dans `npm run release` | `npm run prove:game` |
| Fin scellée | indisponible (`seal` n'est pas une commande de `quest-n-click`) | `npm run seal`, `npm run check:spoilers` |
| Servir `dist/` | `npm run preview` (en local seulement) | `npm run preview`, ou `npm start` (toutes interfaces, `$PORT`) |

La page vaut à partir de la 4.2.5, quand la commande est devenue `quest-n-click` (avant, `web-scumm`). Le projet créé et
ses commandes `build` et `release` existent depuis la 3.9.0 ; `npm start` est un lanceur Node depuis la 4.1.8.

<a name="prerequisites"></a>

## Prérequis

- Node 22.12 ou plus récent, le projet installé (`npm install` dans un projet créé, `npm ci` dans le dépôt du moteur).
  Voir [Prérequis](install.requirements.md).
- Python 3 avec les paquets de `requirements.txt` (Pillow d'abord) : `npm run assets` transforme `art/` et `audio/` en
  `public/assets`, et le `build` d'un projet créé le lance à chaque fois. Dans un projet créé, le fichier est
  `node_modules/@quest-n-click/engine/requirements.txt`.
- ffmpeg quand le jeu a des sons, des musiques ou des vidéos à encoder, et pour une release quand le jeu déclare une
  musique en stems (`validate --release` les mesure avec ffprobe).
- Un jeu qui passe ses vérifications : [Vérifier son jeu](create.checking.md). La construction les relance et s'arrête
  à la première qui échoue.

<a name="where-to-run"></a>

## Où lancer les commandes

- « Dans le projet créé » : le dossier fait par `quest-n-click create`, celui qui contient `game/` et `package.json`.
- « Dans le dépôt du moteur » : le clone de `Quest-n-Click/quest-n-click`. Le jeu construit est celui que nomme `GAME`, sinon
  celui choisi par `npm run game`, sinon `package.json` → `config.game`, sinon `demo`.

<a name="steps"></a>

## Étapes

<!-- step: assets -->
1. **Préparer les assets** quand des images ou des sons ont changé.

   ```sh
   # dans le dépôt du moteur (public/assets y est commité : commitez ce que la commande écrit)
   npm run assets
   ```

   Dans un projet créé, `public/assets` n'est pas commité (son `.gitignore` le liste) et `npm run build` lance
   `assets` lui-même.

<!-- step: build -->
2. **Construire.**

   ```sh
   # dans le projet créé
   npm run build
   ```

   Elle enchaîne, et s'arrête au premier échec : `assets` ; `verify` (validation, solveur, état des traductions, lint,
   playtests) ; la construction Vite dans `dist/` ; puis le contrôle que chaque fichier de `dist/` est recensé.

   ```sh
   # dans le dépôt du moteur
   npm run build
   ```

   Elle lance `check` (types, tests Node) puis `build:game` : `verify:game` (validation, solveur, solveur par chapitre,
   variantes, état des traductions, lint, playtests), la construction Vite, `verify:dist`, `check:spoilers` et
   `audit:assets`.

<!-- step: release -->
3. **Passer les contrôles de release** avant une sortie publique.

   ```sh
   # dans le projet créé
   npm run release                 # ou : npm run release -- --commercial
   ```

   `release` lance `assets`, `verify` et la construction, puis : `validate --release` (le verrou de provenance, les
   placeholders, les ids), `weight --release` (ce qu'un téléphone télécharge, face aux `assetBudgets` du jeu),
   `i18n status`, `voices check --release`, `playtests --strict`, `solve --prove` (chaque état atteignable),
   `solve-reality`, et avec `--commercial` `validate --commercial --errors` (aucune exception, aucun placeholder, aucune
   licence non commerciale) ; enfin le contrôle de `dist/`.

   ```sh
   # dans le dépôt du moteur
   npm run verify:release          # ou : npm run verify:commercial
   npm run prove:game
   ```

   Les images du modèle sont des placeholders : une release les refuse tant que chaque fichier n'est pas remplacé, relu
   et verrouillé (`npx quest-n-click provenance --lock` dans un projet créé, `npm run provenance -- --lock` dans le
   dépôt du moteur). Voir [Provenance des assets](create.asset-provenance.md).

<!-- step: seal -->
4. **Sceller la fin**, seulement pour un jeu à fin scellée, dans le dépôt du moteur : sceller la vraie issue,
   construire, commiter, puis déployer. Toute la procédure est dans [La fin scellée](create.sealed-ending.md).

   ```sh
   # dans le dépôt du moteur, games/<id>/private/ending.config.ts rempli
   npm run seal -- --outcome=<key>
   npm run build
   ```

<!-- step: deploy -->
5. **Téléverser `dist/`** chez un hébergeur statique (section suivante), puis **jouer la version en ligne**.

   ```sh
   # dans le dépôt du moteur : joue le jeu déployé jusqu'à la fin, dans un navigateur à taille de téléphone
   node scripts/e2e.mjs https://<votre-site>/
   ```

   `scripts/e2e.mjs` n'existe que dans le dépôt du moteur ; dans un projet créé, jouez le site en ligne à la main
   jusqu'à la fin.

<a name="ship"></a>

### Ce que livre la construction

`npm run build` vérifie les types (dans le dépôt du moteur), lance les tests, assemble et audite le résultat. On
obtient une PWA :

- le service worker met en cache l'application de base (code, styles, la page, les polices de la page, les icônes) dès
  l'installation ;
- les images et les sons sont mis en cache au premier usage, et le moteur réchauffe en tâche de fond le lieu courant,
  les lieux à une sortie et leur audio ;
- par défaut (`GameDef.offline: 'full'`), il télécharge ensuite le reste du jeu pendant les temps morts, si bien que le
  jeu entier se joue hors ligne après la première visite ; avec `offline: 'nearby'`, un lieu jamais visité ni
  réchauffé peut encore demander le réseau. Les lieux ne sont jamais tous téléchargés avant que le jeu démarre : la
  première visite reste légère.

Le menu pause dit au joueur si le jeu entier est en cache. Le détail est dans
[Sous-chemin, cache et service worker](create.deploy-issues.md#cache-and-service-worker).

Chaque construction finit par retirer de `dist/assets` les fichiers qui ne sont pas à ce jeu et par écrire
`dist/licenses/` : la `LICENSE` du moteur, `LICENSE-ASSETS`, `CREDITS.md` tiré de la provenance du jeu,
`THIRD_PARTY_NOTICES.txt` et `assets-manifest.json` (pour chaque fichier : chemin, auteur, source, licence, SHA-256 et
statut). Le contrôle qui suit refuse tout autre fichier dans `dist/`, ainsi qu'un fichier verrouillé ou une notice qui
manque.

<a name="deploying"></a>

### Déployer

`dist/` est statique : n'importe quel hébergeur statique le sert.

- **GitHub Pages** : un workflow construit avec `BASE_PATH=/<dépôt>/` et déploie `dist/`. Pour un projet créé, qui n'a
  pas de workflow, copiez celui de [Publier sur GitHub Pages](create.github-pages.md).
- **Clever Cloud** : une application Node qui construit au déploiement et sert `dist/` ; voir
  [Le jeu statique sur Clever Cloud](create.clever-static.md).
- **Netlify, Cloudflare Pages, nginx, un bucket…** : [Autres hébergeurs statiques](create.other-hosts.md).

Sous un sous-chemin (`https://<utilisateur>.github.io/<dépôt>/`), construisez avec `BASE_PATH=/<dépôt>/` ; à la racine
d'un domaine, pas de `BASE_PATH`. Tous les chemins (scripts, styles, manifeste, icônes, service worker, fichier de la
fin scellée) le suivent :

```sh
# dans le projet créé ou le dépôt du moteur : la même construction que Pages, en local
BASE_PATH=/my-repo/ npm run build
```

Ce qui casse sous un sous-chemin, avec le cache ou avec un site à moitié téléversé :
[Sous-chemin, cache et service worker, déploiement incomplet, retour arrière](create.deploy-issues.md).

Dans le dépôt du moteur, `games/<id>/private/` (photos, planches brutes, configuration de la fin scellée) n'est jamais
envoyé : `.gitignore` l'exclut, et rien de ce dossier n'est copié dans `dist/`. Le `.gitignore` d'un projet créé ne
liste que `node_modules`, `dist`, `.cache` et `public/assets` : gardez les fichiers privés hors de `game/`, ou
ajoutez-les-y.

> [!LIMIT id=release-proof-not-witness]
> `npm run build` et `npm run verify` demandent au solveur un témoin : un chemin vers une fin. Seule la release
> (`npm run release` dans un projet créé, `npm run prove:game` dans le dépôt du moteur) demande la preuve exhaustive,
> qui échoue sur un blocage ou une recherche tronquée. [Ce que prouve le solveur](create.solver-proofs.md) dit ce que
> chacune permet de conclure.

> [!LIMIT id=accessibility-machine-only]
> La CI vérifie l'accessibilité autant qu'une machine le peut (axe-core sur chaque écran, le jeu au clavier et au
> toucher). Ce n'est pas une conformité WCAG : le lecteur d'écran et les vrais appareils sont des passes humaines.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- La commande se termine sans erreur et `dist/` contient `index.html`, `sw.js`, `manifest.webmanifest`, `assets/`,
  `icons/`, `fonts/` et `licenses/`.
- `npm run preview` le sert sur `http://127.0.0.1:4173/` : jouez-y avant de téléverser.
- Après le téléversement, jouez le site en ligne jusqu'à la fin sur un vrai téléphone, en paysage ; ouvrez le menu
  pause et attendez « complete » sur sa ligne « Offline » (ou sa traduction) avant de tester hors ligne.
- Les dernières vérifications avant de partager le lien (un vrai téléphone, quelqu'un d'autre qui joue sans aide, la
  fin scellée) sont dans [Vérifier son jeu](create.checking.md#before-you-share).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `python3` introuvable, ou `No module named 'PIL'` | L'étape des assets demande Python 3 et Pillow | `pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt` (projet créé) ou `pip install --require-hashes -r requirements.txt` (dépôt du moteur) |
| `provenance.lock.json › missing: a release ships the files that were reviewed` | Pas encore de verrou | Relire les assets, puis les verrouiller (étape 3) |
| Un placeholder refusé par `validate --release` | Les images du modèle sont toujours là | Les remplacer, ou les nommer dans `releaseExceptions` avec une raison (refusé par `--commercial`) |
| `audio.scores › ffprobe not found` | Une release mesure les stems | Installer ffmpeg, puis `npx quest-n-click doctor` |
| Un fichier de `dist/` non recensé | Un fichier égaré dans `public/`, ou un asset d'un autre jeu | Le retirer, ou le déclarer (un fichier de données que le jeu nomme) |
| Une page blanche une fois en ligne, sous `/<dépôt>/` | Construit sans `BASE_PATH` | [Sous-chemin](create.deploy-issues.md#sub-path) |
| `audit: <n> leak(s) found` sur un mot de votre jeu | Un mot du projet privé d'origine du moteur est aussi, par hasard, un mot de votre jeu (le prénom d'une vraie personne) | [L'autoriser pour votre jeu](#audit-allow) |

<a name="audit-allow"></a>

### Un mot de votre jeu bloqué par l'audit des fuites

`audit:assets` (lancé par `build:game`) bloque les mots du projet privé d'origine du moteur, gardés en préfixes SHA-1.
Quand l'un d'eux est aussi un mot dont votre jeu a besoin, autorisez-le pour votre jeu seulement, dans
`games/<id>/audit-allow.json`, par le préfixe que l'audit garde déjà et une raison qui n'écrit pas le mot :

```json
{ "allow": [{ "sha1": "<les 12 premiers chiffres hexadécimaux du SHA-1 du mot>", "why": "une collègue dans le jeu" }] }
```

Le préfixe d'un mot : `node -e "console.log(require('crypto').createHash('sha1').update('<mot>').digest('hex').slice(0, 12))"`,
en minuscules. Le mot est alors autorisé dans `games/<id>/` (sauf dans `audit-allow.json` lui-même) et, quand `<id>`
est le jeu construit, dans `public/assets/` ; partout ailleurs, c'est toujours une fuite. Un préfixe que l'audit ne
bloque pas arrête l'audit : le fichier ne peut pas survivre au mot qu'il excuse.

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `dist/` : vidé et réécrit à chaque construction (non commité).
- `public/assets/` et `.cache/refs.json` : écrits par `assets` (commités dans le dépôt du moteur, pas dans un projet
  créé).
- `games/<id>/data/` (dépôt du moteur) : le fichier de la fin scellée, écrit par `seal`.
- Rien dans `node_modules/@quest-n-click/engine` : le moteur est lu, jamais écrit.

<a name="recovery"></a>

## Revenir en arrière

Une construction ne change rien qu'on ne puisse reconstruire : supprimez `dist/` et relancez-la. Pour remettre en ligne
une version précédente, déployez la construction d'un commit précédent ; ce que font alors les caches et les
sauvegardes des joueurs est dans [Retour arrière](create.deploy-issues.md#going-back).

<a name="references"></a>

## Références

- [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs) : ce que lancent `build` et `release` dans un projet créé.
- [`package.json`](../../package.json) : `build`, `build:game`, `verify:release`, `verify:commercial`, `prove:game`,
  `start` dans le dépôt du moteur ; [`scripts/start.mjs`](../../scripts/start.mjs).
- [`tools/dist.ts`](../../tools/dist.ts) : ce que `dist/` peut contenir ; [`tools/validate.ts`](../../tools/validate.ts) :
  les contrôles de release et commerciaux.
- [`vite.config.ts`](../../vite.config.ts) : la construction et le service worker.
- [Scripts npm](reference.npm-scripts.md), [Le paquet](install.package.md).
