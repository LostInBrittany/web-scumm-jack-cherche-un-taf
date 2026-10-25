# Le jeu statique sur Clever Cloud

Le jeu est un site statique ; sur Clever Cloud, il tourne comme une petite application Node qui construit `dist/` à
chaque déploiement et le sert. Cette page ne traite que du jeu. Héberger le Studio d'équipe est une autre affaire :
[Vue d'ensemble Clever Cloud](clever.overview.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Une application Node Clever Cloud, déployée par `git push` via `clever deploy`, qui sert votre jeu sur son domaine.
Chaque déploiement reconstruit le jeu à partir du commit poussé.

<a name="context-and-versions"></a>

## Contexte et versions

Deux cas, deux réglages :

- **Le dépôt du moteur** (un jeu dans `games/<id>/`) : `npm start` sert `dist/` avec sirv
  ([`scripts/start.mjs`](../../scripts/start.mjs)), sur toutes les interfaces, sur `$PORT` (8080 s'il n'est pas
  défini), chaque fichier avec `Cache-Control` `max-age=3600`. Ce lanceur existe depuis la 4.1.8. `public/assets` est
  commité dans ce dépôt : le déploiement n'a besoin que de Vite, pas de Python.
- **Un projet créé** (`quest-n-click create`) : il n'a ni script `start` ni serveur statique (le paquet du moteur
  laisse `sirv-cli` de côté), et `public/assets` n'est pas commité : le déploiement doit lancer l'étape des assets, qui
  demande Python et Pillow.

La page vaut à partir de la 4.2.5. **Vérifié sur : non vérifié.** Les réglages du dépôt du moteur ci-dessous sont ceux
que donnait `docs/fr/TOOLS.md` jusqu'à la 4.4.0 ; personne n'a rejoué cette page sur une application Clever Cloud
réelle, et le cas du projet créé n'y a jamais été déployé par le projet. Lisez chaque commande avant de la lancer.

<a name="prerequisites"></a>

## Prérequis

- Un compte Clever Cloud et `clever-tools`, connecté (`clever login`).
- Le jeu se construit sur votre machine ([Construire et publier un jeu](create.build-release.md)) : le déploiement
  relance la construction, et une construction qui échoue laisse la version précédente en ligne.
- Le projet est un dépôt Git, son travail commité : `clever deploy` pousse le commit de la branche courante.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur ou dans le projet créé : `clever …` relie ce dossier à l'application et
pousse son historique Git. La construction elle-même tourne sur Clever Cloud.

<a name="steps"></a>

## Étapes

<!-- step: create-app -->
1. Créez une application Node et reliez-la au dossier :

   ```sh
   # dans le dépôt du moteur ou le projet créé
   clever create --type node my-game
   ```

<!-- step: configure -->
2. Réglez la construction.

   **Dépôt du moteur** : Vite est une dépendance de développement, la construction est `build:web`, et `GAME` nomme
   le jeu (sinon `package.json` → `config.game`, sinon `demo`) :

   ```sh
   # dans le dépôt du moteur
   clever env set CC_NODE_DEV_DEPENDENCIES install
   clever env set CC_POST_BUILD_HOOK "npm run build:web"
   clever env set GAME my-game
   ```

   **Projet créé** : donnez-lui un serveur et une commande de démarrage, puis un hook de construction qui installe
   Pillow à côté de l'application et construit :

   ```sh
   # dans le projet créé
   npm install sirv-cli@3
   npm pkg set scripts.start="sirv dist --host 0.0.0.0 --port \$PORT --maxage 3600"
   clever env set CC_POST_BUILD_HOOK "python3 -m pip install --target .python --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt && PYTHONPATH=.python npm run build"
   git add package.json package-lock.json && git commit -m "Serve dist/ on Clever Cloud"
   ```

   Le `build` du projet créé lance `verify` (solveur compris) sur le serveur, à chaque déploiement.

<!-- step: base-path -->
3. Laissez `BASE_PATH` vide : l'application sert le jeu à la racine de son domaine. Ne le réglez que si un proxy devant
   publie le jeu sous un sous-chemin ([Sous-chemin](create.deploy-issues.md#sub-path)).

<!-- step: deploy -->
4. Déployez, et suivez les journaux :

   ```sh
   # dans le dépôt du moteur ou le projet créé
   clever deploy
   clever logs
   ```

<!-- step: domain -->
5. Ouvrez-le sur le domaine que donne Clever Cloud (`clever open`), ou ajoutez le vôtre avec
   `clever domain add play.example.org` et son enregistrement DNS.

> [!LIMIT id=build-web-skips-checks]
> Dans le dépôt du moteur, `build:web` est la seule construction Vite : ni validation, ni solveur, ni `verify:dist`, ni
> contrôle des spoilers. Lancez `npm run build` (ou laissez la CI le faire) avant de déployer ; le déploiement ne le
> fait pas.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `clever logs` montre la construction du hook, puis sirv à l'écoute sur le port 8080.
- Le jeu s'ouvre sur le domaine de l'application ; la ligne « Offline » (ou sa traduction) du menu pause finit sur « complete » (le texte par défaut du moteur ; un jeu le traduit).
- Dans le dépôt du moteur, `node scripts/e2e.mjs https://<votre-domaine>/` le joue jusqu'à la fin.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `vite: not found` dans le journal de construction | Dépendances de développement non installées (dépôt du moteur) | `CC_NODE_DEV_DEPENDENCIES=install` |
| L'application ne devient jamais saine | Rien n'écoute sur `$PORT`, ou seulement sur `127.0.0.1` | `npm start` doit servir sur `0.0.0.0:$PORT` (le lanceur et le script ci-dessus le font) |
| `No module named 'PIL'` | Le hook n'a pas installé Pillow, ou `PYTHONPATH` manque | Gardez les deux parties du hook du projet créé |
| Le jeu de démo au lieu du vôtre | `GAME` non réglé dans le dépôt du moteur | `clever env set GAME <id>`, puis déployez |
| La version précédente reste affichée | Le service worker attend le joueur ; `index.html` est en cache une heure | [Cache et service worker](create.deploy-issues.md#cache-and-service-worker) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- L'application et ses variables sur Clever Cloud ; un remote `clever` et `.clever.json` dans le dossier.
- Projet créé : `package.json` (`start`, la dépendance `sirv-cli`) et `package-lock.json`.
- `dist/` et `.python/` sur le système de fichiers de l'application, reconstruits à chaque déploiement.

<a name="recovery"></a>

## Revenir en arrière

Une construction qui échoue n'est pas déployée : l'instance en place continue de servir la version précédente. Pour
revenir à une version antérieure, annulez le commit et relancez `clever deploy` ; les caches et les sauvegardes des
joueurs suivent alors [Retour arrière](create.deploy-issues.md#going-back). `clever delete` supprime l'application.

<a name="references"></a>

## Références

- [`scripts/start.mjs`](../../scripts/start.mjs) (`npm start`), [`package.json`](../../package.json) (`build:web`).
- [`tools/game.ts`](../../tools/game.ts) : comment `GAME` choisit le jeu.
- [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs) et [`scripts/pack.mjs`](../../scripts/pack.mjs) : les commandes
  d'un projet créé, et le paquet sans `sirv-cli`.
- Les variables : [`CC_POST_BUILD_HOOK`](reference.environment-variables.md#cc-post-build-hook),
  [`CC_NODE_DEV_DEPENDENCIES`](reference.environment-variables.md#cc-node-dev-dependencies),
  [`PORT`](reference.environment-variables.md#port), [`GAME`](reference.environment-variables.md#game).
