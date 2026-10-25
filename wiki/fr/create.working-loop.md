# La boucle de travail

Écrire une règle, la placer, la vérifier, y jouer : la boucle par laquelle passe chaque modification d'un jeu, avec
les commandes de chaque étape dans un projet créé et dans le dépôt du moteur.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un jeu qui tourne dans votre navigateur et se recharge à chaque modification, un éditeur de placement pour la
géométrie, le validateur et le solveur relancés après chaque changement, et des vues de débogage qui démarrent le jeu
à n'importe quel point de reprise.

<a name="context-and-versions"></a>

## Contexte et versions

- Un projet créé (`quest-n-click create`, le jeu dans `game/`) ou le dépôt du moteur (les jeux dans `games/<id>/`).
  La [page d'organisation](create.project-layout.md) dit quels scripts existent où.
- Depuis 4.3.0. Le jeu courant est un lien dans `.cache/game` depuis 4.1.6 (jusqu'en 4.1.5, `npm run dev` réécrivait
  `tsconfig.json`).

<a name="prerequisites"></a>

## Prérequis

- Node 22.12 ou plus récent, et les dépendances du projet installées (`npm install` dans un projet créé, `npm ci` dans
  le dépôt du moteur) : [prérequis](install.requirements.md).
- Python 3 avec Pillow pour `npm run assets` ([chaîne d'images](install.image-toolchain.md)).
- Un jeu : [votre premier jeu](create.first-game.md) en fabrique un.

<a name="where-to-run"></a>

## Où lancer les commandes

Toutes les commandes se lancent à la racine du projet, sur votre machine : le dossier qui contient `package.json` (le
dossier du projet créé, ou le clone du dépôt du moteur). `npm run dev` et `npm run studio` existent aux deux endroits ;
`npm run validate` et `npm run solve` sont des scripts du seul dépôt du moteur, et s'écrivent
`npx quest-n-click validate` et `npx quest-n-click solve` dans un projet créé.

<a name="steps"></a>

## Étapes

<!-- step: prepare-assets -->
1. Préparez les images et les sons une première fois, puis à chaque ajout :

   ```sh
   # dans le projet créé, ou dans le dépôt du moteur
   npm run assets
   ```

<!-- step: run-dev -->
2. Lancez le jeu. Il s'ouvre sur `http://127.0.0.1:5173/` et se recharge quand un fichier du jeu change :

   ```sh
   # dans le projet créé, ou dans le dépôt du moteur
   npm run dev
   ```

   Ou lancez le Studio, le vrai moteur avec un éditeur par-dessus, sur `http://127.0.0.1:5173/__studio/`
   ([le Studio local](studio.overview.md)) :

   ```sh
   # dans le projet créé, ou dans le dépôt du moteur
   npm run studio
   ```

<!-- step: write -->
3. Écrivez ce qui se passe dans `rooms/<salle>.ts` (accessoires, acteurs, zones, textes Regarder, réactions, sujets,
   indices), avec l'histoire dans `storyboard.json` ([salles](create.rooms.md), [le storyboard](create.storyboard.md)).

<!-- step: place -->
4. Placez ce que vous avez écrit : ouvrez `?edit=<salle>` sur le serveur de développement, ou l'onglet Rooms du
   Studio. L'éditeur écrit `layout/<salle>.json` ([géométrie](create.geometry.md)).

<!-- step: check -->
5. Vérifiez. L'onglet Check du Studio relance le validateur et le solveur après chaque enregistrement ; depuis le
   terminal :

   ```sh
   # dans le dépôt du moteur
   npm run validate
   npm run solve
   ```

   ```sh
   # dans le projet créé
   npx quest-n-click validate
   npx quest-n-click solve
   npm run verify        # validate, solve, i18n status, lint, playtests
   ```

<!-- step: play -->
6. Jouez la salle : `/?dev&at=<point>` démarre sur un point de reprise avec la couche de débogage
   ([paramètres d'URL ci-dessous](#playing)). Sur un téléphone, voir [tester par le réseau local](create.lan-testing.md).

<a name="choosing-the-game"></a>

## Choisir le jeu (`GAME`)

Dans un projet créé il n'y a qu'un jeu, `game/`, rien à choisir.

Le dépôt du moteur peut contenir plusieurs jeux, chacun dans `games/<id>/`. Le jeu courant est, dans cet ordre
([`tools/game.ts`](../../tools/game.ts)) :

1. la variable d'environnement `GAME` (`GAME=demo npm run dev`) ;
2. sinon le jeu vers lequel pointe `.cache/game` (posé par `npm run game` ou `npm run new-game`) ;
3. sinon `package.json` → `"config": { "game": "demo" }` ;
4. sinon `demo`.

`GAME_DIR=<dossier>` dirige les outils vers un dossier de jeu hors de `games/` (une fixture de test, par exemple).

La règle est codée une seule fois, dans `tools/game.ts`, et lue par `vite.config.ts` (l'alias `@game` →
`games/<GAME>/index.ts`, les layouts de l'éditeur écrits dans `games/<GAME>/layout/`), `tools/validate.ts`,
`tools/solve.ts`, `tools/refs.ts` ; `tools/assets.py` fait la même lecture en Python.

`tsconfig.json` ne sait pas lire une variable d'environnement : ses chemins `@game` et `@game/*` regardent dans
`.cache/game`, un lien symbolique que `npm run game` (`tools/select-game.ts`) fait pointer vers le jeu courant, avec
`games/demo` en repli tant qu'aucun lien n'existe. `npm run dev`, `npm run studio`, `npm run check` et `npm run build`
le lancent d'abord ; `GAME=<id> npm run game` et `npm run new-game` changent de jeu. Vite et Vitest n'ont pas besoin du
lien : ils résolvent l'alias dans `vite.config.ts`.

```sh
# dans le dépôt du moteur
GAME=heroes npm run game     # heroes devient le jeu courant
npm run dev                  # joue games/heroes
```

Les tests du moteur ne dépendent pas du jeu courant : ils tournent sur `tests/fixture/` (un tout petit jeu), et les
tests propres à un jeu importent directement ses fichiers (`tests/demo.test.ts`, `tests/walkthrough.test.ts`).

<a name="playing"></a>

## Jouer et déboguer

```sh
# dans le dépôt du moteur
npm run dev        # serveur de développement, boucle locale seulement
npm run dev:lan    # mode réseau local explicite pour un téléphone ; affiche une URL à jeton valable une session
npm run studio     # Studio, boucle locale seulement
npm run studio:lan # Studio protégé par jeton sur le réseau local
```

Paramètres d'URL, serveur de développement seulement (le build de production les ignore ; la liste complète est sur
[paramètres d'URL de développement](reference.dev-url-parameters.md)) :

| URL | Effet |
|---|---|
| `/` | Le jeu normal : écran titre, Nouvelle partie / Continuer. |
| `/?dev` | Démarre sur le premier point de reprise, avec la couche de débogage et le panneau DEV. La touche D masque la couche. |
| `/?dev&at=<point>` | Démarre sur ce point de reprise (défini dans les `checkpoints` du jeu). |
| `/?edit=<salle>` | L'éditeur de placement de la salle. |
| `/?edit=<salle>&at=<point>` | Pareil, dans l'état de ce point de reprise (utile pour placer un accessoire dans un état donné). |

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- La page se recharge avec votre modification ; l'onglet Check du Studio, ou `validate`, n'affiche aucune erreur.
- `solve` affiche un chemin de Nouvelle partie jusqu'à la fin, étape par étape.
- `/?dev` montre les zones de la salle (zone de marche en vert, zones cliquables en bleu, accessoires en violet,
  points d'approche en pastilles).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm run validate` répond « Missing script » | Vous êtes dans un projet créé | `npx quest-n-click validate` |
| Le serveur joue un autre jeu que celui que vous modifiez | `GAME` est posé dans votre shell, ou `.cache/game` pointe ailleurs | `GAME=<id> npm run game`, ou retirez `GAME` |
| Une image manque à l'écran | `npm run assets` n'a pas tourné depuis son ajout | Lancez `npm run assets` |
| `?dev` ou `?edit` ne fait rien | Vous avez ouvert un build de production (`npm run preview`) | Passez par le serveur de développement |
| « no layout: nothing will be clickable » | La salle n'a jamais été placée | Ouvrez `?edit=<salle>` et enregistrez |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `npm run assets` : `public/assets/` et `assets.gen.json`, `.cache/refs.json`.
- L'éditeur de placement et le Studio : `layout/<salle>.json` (et les fichiers que vous modifiez dans le Studio).
- `npm run game`, `npm run new-game` : le lien `.cache/game` (dépôt du moteur).

<a name="recovery"></a>

## Reprise ou retour arrière

Tout ce qu'écrit la boucle est un fichier de votre projet : commitez avant un gros changement, et `git restore` les
fichiers pour revenir en arrière. `public/assets/` se reconstruit avec `npm run assets`.

<a name="references"></a>

## Références

- [Organisation d'un projet créé et du dépôt du moteur](create.project-layout.md)
- [Vérifier son jeu](create.checking.md), [le Studio local](studio.overview.md)
- [`tools/game.ts`](../../tools/game.ts), [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs),
  [`src/engine/dev/index.ts`](../../src/engine/dev/index.ts)
