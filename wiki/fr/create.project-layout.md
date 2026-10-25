# Organisation d'un projet créé et du dépôt du moteur

Un jeu vit à l'un de deux endroits, et les commandes ne sont pas les mêmes. Cette page dit ce que contient chacun, où
sont les fichiers du jeu, et quels scripts `npm run` existent où. Quand une page dit « dans le projet créé » ou « dans
le dépôt du moteur », c'est de cette différence qu'il s'agit.

| | Un projet créé | Le dépôt du moteur |
|---|---|---|
| Fait par | `npm init @quest-n-click my-game "My Game"` ou `npx quest-n-click create …` | `git clone` de `Quest-n-Click/quest-n-click` |
| Dossier du jeu | `game/` | `games/<id>/` (plusieurs jeux côte à côte) |
| Le moteur | `node_modules/@quest-n-click/engine/` (installé, jamais modifié) | `src/engine/` (vous pouvez le modifier) |
| Quel jeu | toujours `game/` | `GAME`, sinon `.cache/game`, sinon `config.game` dans `package.json`, sinon `demo` ([choisir le jeu](create.working-loop.md#choosing-the-game)) |
| Scripts `npm run` | huit (ci-dessous) | environ 150, toute la boîte à outils |

<a name="created-project"></a>

## Un projet créé

`quest-n-click create <dossier> ["Titre"] [--engine=<spec npm>]` ([`cli/create.mjs`](../../cli/create.mjs)) refuse un
dossier qui existe et n'est pas vide, puis écrit :

| Chemin | Contenu |
|---|---|
| `game/` | le jeu modèle ([`games/_template`](../../games/_template)), `__ID__` et `__TITLE__` remplacés ; le `tests/` du modèle n'est pas copié |
| `game/provenance.json` | une entrée qui déclare chaque image comme provisoire, dessinée à partir de formes : une release la refuse tant que chaque fichier n'est pas remplacé et relu (`npx quest-n-click provenance --lock`) |
| `public/` | les icônes de la page, son image d'aperçu (`og.png`) et la police complète sur laquelle le moteur se replie ; `public/assets/` est écrit par `npm run assets`, jamais commité |
| `package.json` | `"config": { "game": "<id>" }`, la dépendance au moteur (`^<version>`, ou `--engine`), et les scripts ci-dessous |
| `tsconfig.json` | `@engine/*` pointe dans `node_modules/@quest-n-click/engine/src/engine`, `@quest-n-click/engine/*` dans son API publique, `@game` vers `game/index.ts` |
| `.gitignore` | `node_modules`, `dist`, `.cache`, `public/assets` |
| `README.md` | les cinq commandes ci-dessous, en aide-mémoire |

Ensuite, `npm run build` écrit `dist/` (avec `licenses/`), et les outils écrivent `.cache/`.

Dans le projet créé, `npm run dev` et `npm run studio` appellent `quest-n-click dev` ou `quest-n-click studio`, qui
lancent la configuration Vite du paquet avec le projet comme dossier de travail et `game/` comme jeu : le jeu sur
`http://127.0.0.1:5173/`, le Studio sur `/__studio/`, ouvert dans le navigateur. Ni l'un ni l'autre n'est le Studio
Server hébergé ([Studio d'équipe](team.what-runs-where.md)).

L'id du projet est le nom du dossier en minuscules, lettres, chiffres et tirets ; le titre vaut par défaut cet id avec
des majuscules aux mots.

<a name="game-files"></a>

## Les fichiers du jeu

Les mêmes fichiers aux deux endroits : `game/` dans un projet créé, `games/<id>/` dans le dépôt du moteur.

```
index.ts          entry point: export { game, layouts, manifest, minigames?, extraImages?, commands?, locales? }
game.ts           the game: verbs, characters, items, map, global rules, game start, skin (the look), ending, interface texts
cast.ts           the characters, with helpers for the standard sprite sheets (human, cat, mouths)
items.ts          the inventory items
rules.ts          fallback answers, reactions by kind ("never pull a cat"), rules valid everywhere
rooms/<room>.ts   one file per room (logic)
layout/<room>.json one file per room (geometry, written by the editor; never by hand)
storyboard.json   the story, board by board and panel by panel: the source of truth for the text
assets.gen.json   manifest of images and sounds (written by npm run assets)
sources.json      where the asset sources come from (optional)
provenance.json   where each asset comes from and under which licence
site.json         page title, description, theme colour, art style
locales/<lang>.json translations (written by npm run i18n -- extract)
art/, audio/      the sources of the images and sounds
tests/            the game's own tests (engine repository only)
```

En clair : `index.ts` est le point d'entrée ; `game.ts` le jeu (verbes, personnages, objets, carte, règles globales,
départ, habillage, fin, textes d'interface) ; `cast.ts` les personnages ; `items.ts` les objets d'inventaire ;
`rules.ts` les réponses de repli et les réactions par sorte ; `rooms/` une salle par fichier (la logique) ; `layout/`
une géométrie par salle, écrite par l'éditeur ; `storyboard.json` l'histoire, source de vérité du texte ;
`locales/` les traductions ; `art/` et `audio/` les sources des images et des sons.

`index.ts` est celui du modèle et reste tel quel : il rassemble les layouts et les traductions avec Vite, et exporte
les `minigames` du jeu, ses `extraImages` (images à préparer même si aucun contenu ne les cite) et ses `commands`
([code sur mesure](create.custom-code.md)).

<a name="site-json"></a>

## `site.json`

```json
{ "lang": "fr", "title": "…", "shortName": "…", "description": "…", "themeColor": "#0a0a12", "artStyle": "cel" }
```

- `title`, `description` et `themeColor` vont dans `index.html` et dans le manifeste de la PWA.
- `url` (facultatif) est l'adresse publique du jeu, `"https://example.org/mon-jeu/"`. La page donne alors aux aperçus
  de liens une image de partage absolue (`og:image`, `<url>og.png`) et sa propre adresse (`og:url`) : LinkedIn,
  Facebook et X ont besoin des deux, alors qu'un `og.png` relatif n'affiche souvent aucune image. Une adresse qui
  n'est pas une URL `http(s)` absolue, ou qui porte une requête, un fragment ou des
  identifiants, est ignorée.
- `artStyle` vaut `"cel"` (par défaut : dessin animé peint) ou `"pixel"` (pixel art rétro). Il change les prompts
  d'images (`npm run prompts`), le découpeur (`tools/cut-sheet.py`) et `npm run assets` (WebP sans perte,
  redimensionnement au plus proche voisin). Pour `pixel`, posez aussi `skin: { pixelArt: true }` dans `game.ts`.
- `sheetBackground` (facultatif) est le fond sur lequel les planches sont générées : `"transparent"` ou une couleur
  `"#RRGGBB"`, `#2B2E45` en son absence. Il change les prompts, et le découpeur suit la planche qu'on lui donne
  ([images](create.images.md)).

<a name="scripts"></a>

## Quels scripts existent où

Le `package.json` d'un projet créé a huit scripts. Chacun appelle la commande du moteur, `quest-n-click`, avec le
dossier du projet comme dossier de travail ([`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs)) :

| Dans le projet créé | Lance | Dans le dépôt du moteur |
|---|---|---|
| `npm run dev` | le jeu dans le navigateur, rechargé à chaque modification | `npm run dev` (le jeu courant) |
| `npm run studio` | le Studio | `npm run studio` |
| `npm run assets` | `art/` et `audio/` vers `public/assets` (Python 3 avec Pillow) | `npm run assets` |
| `npm run verify` | validate, solve, i18n status, lint, playtests | `npm run verify:game` (ajoute la preuve par chapitres et les mondes Remix) |
| `npm run build` | assets, verify, le build de production dans `dist/`, chaque fichier justifié | `npm run build` (vérifie aussi les types et lance d'abord les tests du moteur) |
| `npm run release` | build, puis les portes de la release ; `--commercial` : aucune exception, aucun provisoire | `npm run verify:release`, `npm run verify:commercial` |
| `npm run preview` | sert `dist/` sur 127.0.0.1 | `npm run preview` |
| `npm run quest-n-click -- <commande>` | toute autre commande du moteur | (les scripts ci-dessous) |

Tous les autres outils sont des sous-commandes de `quest-n-click`, lancées avec `npx` dans le projet créé :

```sh
# dans le projet créé
npx quest-n-click validate
npx quest-n-click solve --prove
npx quest-n-click help        # la liste complète
```

Dans le dépôt du moteur, ces mêmes outils ont chacun leur script : `npm run validate`, `npm run solve`,
`npm run lint`, `npm run i18n`, `npm run ids`, `npm run prompts`, `npm run voices`, `npm run weight`,
`npm run provenance`, `npm run playtests`, `npm run migrate`, `npm run mcp`, `npm run doctor`. Le tableau complet est
sur [scripts npm](reference.npm-scripts.md).

Seulement dans le dépôt du moteur : `npm run new-game`, `npm run game`, `npm run dev:lan`, `npm run studio:lan`,
`npm test` et `npm run check` (les tests du moteur), `npm run e2e*`, `npm run replay`, `npm run remix`,
`npm run page:*`, `npm run seal`, et les scripts de release et de qualification.

> [!LIMIT id=no-lan-in-project]
> Un projet créé n'a ni `dev:lan` ni `studio:lan`, ni `start`, ni workflow GitHub Pages. Tester sur un téléphone par
> le réseau depuis un projet créé est décrit dans [tester sur un téléphone par le réseau local](create.lan-testing.md).

> [!LIMIT id=doctor-in-project]
> `npx quest-n-click doctor` dans un projet créé importe Playwright, dont le paquet ne dépend pas : la commande peut
> y échouer tant que Playwright n'est pas installé ([dépannage de l'installation](install.troubleshooting.md)).

<a name="engine-repository"></a>

## Le dépôt du moteur

On le clone pour travailler sur le moteur, ou pour garder plusieurs jeux à côté (`games/demo`, `games/heroes`,
`games/reference`, `games/signals`, `games/_template`, [jeux d'exemple](create.example-games.md)). Il faut Node 22.12 ou
plus récent (`engines` dans `package.json`) ; `npm run doctor` dit ce qui manque ([prérequis](install.requirements.md)).

`npm run dev` et `npm run studio` marchent aux deux endroits. Dans le dépôt du moteur, ils font d'abord pointer
`.cache/game` vers le jeu courant ([choisir le jeu](create.working-loop.md#choosing-the-game)), puis lancent Vite sur
`http://127.0.0.1:5173/` (boucle locale seulement ; le Studio sur `/__studio/`). Dans un projet créé, ils ouvrent
l'unique jeu du projet ([plus haut](#created-project)). Ni l'un ni l'autre n'est le Studio Server hébergé
([Studio d'équipe](team.what-runs-where.md)).

<a name="engine-code"></a>

## Organisation du code du moteur

```
src/engine/
  core/        pure logic (no DOM): state, conditions, reactions, scripts, events, conversations, hints, saves
    types.ts     the content format (re-exports types/: content, game, stage, audio, state, session, reality, speedrun)
    engine.ts    the Engine class: player actions, resolution, the command interpreter
    cmds.ts      the catalogue of commands (CMD_KEYS): which change the state, which hold nested lists
    cond.ts      condition evaluation
    define.ts    defineGame / defineRoom, normalizeExits, compileGame, FLOOR and NEAR
    ports.ts     the Presenter interface (what the core asks of the display) + FakePresenter for node
  scene/       the scene frame (pure): SceneFrame, the hit test, the Renderer and Intent contracts (4.1.11)
  dom/         the browser display: app.ts (layout, verbs, inventory, menus), presenter.ts, room.ts (the scene),
               walk.ts (walk areas: earcut triangulation + navmesh paths), audio.ts (Howler), render-dom.ts and
               render-canvas.ts (the two painters), fonts.ts, assets.ts
  minigames/   pipes, stroke, pick, hide, runner, scratch, cables, code-wheel; all their images come from params
  ending/      the sealed ending: seal.ts (AES-GCM), card.ts, index.ts
  reality/     the client of a Reality Bridge
  tools/       validator, solver, lint and the other node tools
  dev/         debug overlay and placement editor (dev server only)
  api/         the public entry points (content, player, minigames, reality, testing)
```

En clair : `core/` est la logique pure, sans DOM (état, conditions, réactions, scripts, conversations, sauvegardes) ;
`scene/` l'image de la scène et le test de toucher ; `dom/` l'affichage dans le navigateur, avec ses deux peintres ;
`minigames/`, `ending/` et `reality/` les modules optionnels ; `tools/` le validateur, le solveur et les autres outils
node ; `dev/` l'éditeur de placement ; `api/` les points d'entrée publics.

La règle : `src/engine/` n'importe jamais rien de `games/` et ne nomme jamais une image, un son ou un texte
d'interface. Les textes viennent de `GameDef.ui` ; les icônes, sons, polices et tailles par défaut de `GameDef.skin`
([habillage et polices](create.skin-fonts.md)) ; les images des mini-jeux de leurs `params` ; la fin scellée de
`GameDef.ending`. `src/main.ts` importe `@game` (un alias vers le `index.ts` du jeu) et ne sait rien d'autre du jeu.
Les ids de verbes sont libres (les `verbs` du jeu) ; quatre ont un sens pour le moteur : `look`, `talk`, `give` et
`use` ([réactions](create.reactions.md)). La visite du code pour les contributeurs est dans
[architecture](contribute.architecture.md).

<a name="related"></a>

## Identifiants liés

- `quest-n-click create`, `npm init @quest-n-click`, `npm run new-game` ([votre premier jeu](create.first-game.md)).
- `GAME`, `GAME_DIR`, `config.game` ([la boucle de travail](create.working-loop.md#choosing-the-game)).
- Les CLI, avec chaque sous-commande : [référence des CLI](reference.cli.md).
