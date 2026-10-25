# Publier sur GitHub Pages

Un projet créé n'a pas de workflow de CI. Cette page en donne un : à chaque push sur `main`, GitHub construit le jeu
avec le chemin de base du dépôt et publie `dist/` sur GitHub Pages, à `https://<utilisateur>.github.io/<dépôt>/`.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un fichier de workflow, `.github/workflows/pages.yml`, dans le dépôt de votre jeu. Chaque push sur `main` lance les
vérifications et la construction du jeu, et ne déploie le résultat sur Pages que si elles passent.

<a name="context-and-versions"></a>

## Contexte et versions

- Un projet créé (`quest-n-click create`), poussé sur un dépôt GitHub. Le dépôt du moteur avait son propre job Pages
  dans `.github/workflows/ci.yml` jusqu'à la 4.5.1 ; ce workflow en reprend la partie jeu, sans ce que le moteur y
  ajoutait (la démo du Studio et la documentation sous `/docs/`). Depuis la 4.5.2, le moteur ne déploie plus Pages : sa
  démo est sur le site web du projet, `https://quest-n-click.cleverapps.io/demo/`, servie depuis le `quest-n-click-v<version>-web.tar.gz` de chaque
  release (le même build sous `BASE_PATH=/demo/`).
- À partir de la 4.2.5 (la commande `quest-n-click`). `BASE_PATH` est lu par la configuration Vite du moteur
  ([`tools/vite/plugins.ts`](../../tools/vite/plugins.ts)).
- **Vérifié sur : pas exécuté tel quel sur un projet créé.** Les étapes sont celles du job Pages du dépôt du moteur
  en 4.5.1 (lancé à chaque push sur `main`), avec les commandes du projet créé à la place de celles du dépôt. Lisez le journal
  du premier lancement.

<a name="prerequisites"></a>

## Prérequis

- Le projet se construit sur votre machine : `npm run build` passe ([Construire et publier un jeu](create.build-release.md)).
- `package-lock.json` commité (`npm install` l'écrit) : le workflow installe avec `npm ci`.
- Pages activé une fois pour le dépôt : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.

<a name="where-to-run"></a>

## Où lancer les commandes

Le fichier va dans le projet créé, commité et poussé sur `main` ; GitHub l'exécute. La vérification en local de la
même construction se lance dans le projet créé, sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: enable-pages -->
1. Dans les réglages du dépôt, réglez la source de Pages sur **GitHub Actions**.

<!-- step: add-workflow -->
2. Créez `.github/workflows/pages.yml` dans le projet créé :

   ```yaml
   name: pages
   on:
     push:
       branches: [main]
     workflow_dispatch:
   # Le jeton ne fait que lire ; seul le job de déploiement demande davantage.
   permissions:
     contents: read
   # Un déploiement à la fois ; un push plus récent attend au lieu d'annuler celui en cours.
   concurrency:
     group: pages
     cancel-in-progress: false
   jobs:
     build:
       runs-on: ubuntu-24.04
       timeout-minutes: 30
       steps:
         - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
           with:
             node-version: 22
             cache: npm
         - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7
           with:
             python-version: '3.12'
         - run: npm ci
         # L'étape des assets (npm run assets, dans build) demande Pillow ; la liste est livrée avec le moteur.
         - run: pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
         # Seulement quand game/audio ou une vidéo contient des fichiers à encoder : le runner n'a pas ffmpeg.
         - run: command -v ffmpeg || (sudo apt-get update && sudo apt-get install -y ffmpeg)
         # Assets, verify (validation, solveur, traductions, lint, playtests), la construction, dist/ recensé.
         - run: npm run build
           env:
             # https://<utilisateur>.github.io/<dépôt>/ : tous les chemins de la construction sous /<dépôt>/.
             BASE_PATH: /${{ github.event.repository.name }}/
         - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5
           with:
             path: dist
     deploy:
       needs: build
       runs-on: ubuntu-24.04
       timeout-minutes: 15
       permissions:
         pages: write
         id-token: write
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5
   ```

   Les actions sont épinglées sur les commits qu'utilise le dépôt du moteur. Pour publier avec les contrôles de
   release ([`npm run release`](create.build-release.md#steps)), mettez `npm run release` à la place de
   `npm run build`.

<!-- step: base-path -->
3. Choisissez `BASE_PATH` selon votre adresse :

   | Adresse | `BASE_PATH` |
   |---|---|
   | `https://<utilisateur>.github.io/<dépôt>/` (un site de projet) | `/<dépôt>/`, comme dans le workflow |
   | `https://<utilisateur>.github.io/` (un dépôt nommé `<utilisateur>.github.io`) | retirez le bloc `env` : `/` |
   | Un domaine personnalisé, à sa racine | retirez le bloc `env` : `/` |

   Écrivez-le avec une barre oblique à chaque bout. Le manifeste et les icônes de la page s'écrivent
   `<BASE_PATH>icons/…` : sans la barre finale, ils pointent vers `/<dépôt>icons/…`.

<!-- step: check-locally -->
4. Construisez la même chose sur votre machine, et jouez-y :

   ```sh
   # dans le projet créé
   BASE_PATH=/my-repo/ npm run build
   BASE_PATH=/my-repo/ npm run preview
   ```

   Puis ouvrez `http://127.0.0.1:4173/my-repo/`.

<!-- step: push -->
5. Commitez et poussez sur `main`. Le lancement apparaît sous **Actions** ; le résumé du job de déploiement donne
   l'adresse du site.

> [!LIMIT id=no-studio-no-docs]
> Ce workflow ne publie que le jeu. Le site du projet construit aussi la démo du Studio (`STUDIO=1`,
> `VITE_STUDIO_DEMO=1`) et assemble `/docs/` ; ni l'une ni l'autre ne font partie du site d'un projet créé.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Le lancement est vert et le job `deploy` donne le lien `https://<utilisateur>.github.io/<dépôt>/`.
- Le jeu s'y ouvre, la barre d'adresse garde `/<dépôt>/`, et la ligne « Offline » (ou sa traduction) du menu pause finit sur « complete » (le
  préchargement du [cache hors ligne](create.deploy-issues.md#cache-and-service-worker)).
- Les outils de développement du navigateur montrent `https://<utilisateur>.github.io/<dépôt>/sw.js` comme service
  worker actif.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le job de déploiement échoue sur l'environnement ou sur Pages non activé | La source de Pages n'est pas « GitHub Actions » | Étape 1 |
| `npm ci` refuse : pas de `package-lock.json` | Le fichier de verrouillage n'a pas été commité | `npm install` dans le projet créé, commitez `package-lock.json` |
| `No module named 'PIL'` | L'étape pip manque ou a échoué | Gardez `pip install` avant `npm run build` |
| `ffmpeg` introuvable pendant l'encodage de l'audio | Le runner n'en a pas | Gardez l'étape ffmpeg |
| Une page blanche, des 404 sur `/assets/index-….js` | Construit sans `BASE_PATH`, servi sous `/<dépôt>/` | Gardez le bloc `env` ; voir [Sous-chemin](create.deploy-issues.md#sub-path) |
| L'ancienne version reste affichée après un déploiement | Le service worker attend le joueur | [Cache et service worker](create.deploy-issues.md#cache-and-service-worker) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `.github/workflows/pages.yml` dans votre dépôt.
- L'environnement `github-pages` du dépôt, que GitHub crée au premier déploiement.
- Rien de `dist/` n'est commité : le workflow le construit à chaque fois.

<a name="recovery"></a>

## Revenir en arrière

Pour remettre une version précédente, annulez le commit sur `main` (`git revert`) et poussez, ou relancez le workflow
d'un commit précédent (**Actions → ce lancement → Re-run all jobs**) : il construit ce commit et le déploie. Les
joueurs déjà sur la version récente reçoivent l'ancienne par le bandeau de mise à jour, et les sauvegardes suivent les
règles de [Retour arrière](create.deploy-issues.md#going-back). Désactiver Pages (Settings → Pages) dépublie le site.

<a name="references"></a>

## Références

- Le job Pages du dépôt du moteur, jusqu'à la 4.5.1 : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), qui
  n'en a plus depuis la 4.5.2 ; [sa version de la 4.5.1](https://github.com/Quest-n-Click/quest-n-click/blob/v4.5.1/.github/workflows/ci.yml) (`check`, la construction avec `BASE_PATH`, et `pages`).
- `BASE_PATH` et le manifeste : [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts) ;
  [`BASE_PATH`](reference.environment-variables.md#base-path).
- Ce que lancent `npm run build` et `release` dans un projet créé : [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs) ;
  les fichiers du projet : [`cli/create.mjs`](../../cli/create.mjs).
