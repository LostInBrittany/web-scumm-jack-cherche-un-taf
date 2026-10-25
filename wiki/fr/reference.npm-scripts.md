# Scripts npm

Chaque script `npm run` du dépôt du moteur, et chaque script que reçoit un projet créé par `quest-n-click create`.
Chaque script a sa propre section : on y renvoie par `reference.npm-scripts.md#verify-game` (le nom en minuscules,
`:` écrit `-` ; le script d’un projet créé est `#project-<nom>`).

<a name="quick-entry"></a>

## Accès rapide, par tâche

| Je veux… | Dans le dépôt du moteur | Dans un projet créé |
|---|---|---|
| jouer au jeu pendant que je l'écris | [`npm run dev`](#dev) | [`npm run dev`](#project-dev) |
| le modifier à la souris | [`npm run studio`](#studio) | [`npm run studio`](#project-studio) |
| préparer les images | [`npm run assets`](#assets) | [`npm run assets`](#project-assets) |
| le vérifier après un changement | [`npm run validate`](#validate), [`npm run solve`](#solve) | [`npm run verify`](#project-verify) |
| prouver que personne ne reste bloqué | [`npm run solve -- --prove`](#solve), [`npm run prove:game`](#prove-game) | `npx quest-n-click solve --prove` |
| le construire pour le publier | [`npm run build`](#build) | [`npm run build`](#project-build) |
| contribuer au moteur | [`npm run check`](#check), [`npm run quality`](#quality) | — |

<a name="overview"></a>

## Où les lancer

Toutes les commandes se lancent depuis le dossier racine de leur projet, celui qui contient `package.json` :

- dans un clone du **dépôt du moteur** (`quest-n-click/`), après `npm ci` : les scripts
  [du dépôt du moteur](#repository) ci-dessous. Ils travaillent sur le jeu courant, `games/<id>/` : la variable
  `GAME` (`GAME=demo npm run dev`), sinon `package.json` → `"config": { "game": "demo" }`, sinon `demo`. Comment le
  choisir, et comment `npm run game` garde l’éditeur à jour : [create.working-loop](create.working-loop.md#choosing-the-game) ;
- dans un **projet créé** (par `npm init @quest-n-click <dossier>`), après `npm install` : seulement les huit
  scripts [d’un projet créé](#project). Chacun appelle la commande `quest-n-click` du moteur installé ; ses autres
  commandes sont dans [reference.cli](reference.cli.md#quest-n-click).

Un script qui prend des arguments les reçoit après `--` : `npm run solve -- --prove`. `npm run -s <script>` fait taire
les lignes de npm lui-même (ce dont un client MCP a besoin avec `npm run -s mcp`).

> [!LIMIT id=repository-only]
> Les scripts du dépôt du moteur n’existent pas dans un projet créé : là, `npm run validate` n’existe pas, utilisez
> `npx quest-n-click validate` (ou `npm run quest-n-click -- validate`).

Les sections ci-dessous sont générées depuis `package.json`, depuis [`cli/create.mjs`](../../cli/create.mjs) et depuis
les descriptions de [`wiki/data/npm-scripts.json`](../../wiki/data/npm-scripts.json) (`npm run wiki -- generate
reference.npm-scripts`) : un script ajouté sans description, ou une description dont le script a disparu, fait
échouer `npm run wiki -- check`.

<!-- generated:begin -->

<a name="repository"></a>

## Scripts du dépôt du moteur

À lancer dans un clone du dépôt du moteur, depuis son dossier racine (celui qui contient `package.json`), après `npm ci`.

<a name="playing"></a>

### Jouer, servir et choisir le jeu

Lancer le jeu ou le Studio sur cette machine, servir un build, choisir le jeu courant du dépôt.

<a name="dev"></a>

#### `npm run dev`

Le jeu dans le navigateur sur un serveur de dev Vite limité à la boucle locale, rechargé à chaque modification. Il pointe d’abord `.cache/game` vers le jeu courant (`npm run game`). Les paramètres d’URL comme `?dev` et `?edit=<lieu>` y fonctionnent ([reference.dev-url-parameters](reference.dev-url-parameters.md)).

- Lance : `tsx tools/select-game.ts && vite`

<a name="dev-lan"></a>

#### `npm run dev:lan`

Le serveur de dev en mode réseau local explicite, pour un téléphone sur le même réseau : `tools/serve.ts --lan` lance Vite avec un jeton de capacité neuf pour chaque route qui écrit des fichiers et affiche une URL à jeton, valable une session, à ouvrir sur le téléphone.

- Lance : `tsx tools/select-game.ts && tsx tools/serve.ts --lan`

<a name="game"></a>

#### `npm run game`

Pointe `.cache/game` (un lien symbolique que git ignore) vers `games/<GAME>/`, où les chemins `@game` de `tsconfig.json` regardent d’abord (`games/demo` ensuite, pour qu’un clone neuf passe les types). `dev`, `check` et `build` le lancent d’abord ; `GAME=<id> npm run game` change de jeu courant (4.1.6).

- Lance : `tsx tools/select-game.ts`
- Utilisation : `GAME=<id> npm run game`

<a name="new-game"></a>

#### `npm run new-game`

Crée `games/<id>` depuis `games/_template` et en fait le jeu courant ; il écrit un `provenance.json` pour les images empruntées (toutes provisoires, CC BY 4.0).

- Lance : `node scripts/new-game.mjs`
- Utilisation : `npm run new-game <id> ["Working title"]`

<a name="preview"></a>

#### `npm run preview`

Sert `dist/` sur 127.0.0.1 (`vite preview`) : ce vers quoi les scripts e2e sont pointés après un build.

- Lance : `vite preview --host 127.0.0.1`

<a name="start"></a>

#### `npm run start`

Sert `dist/` sur toutes les interfaces au port `$PORT` (8080 par défaut) avec `sirv`, via `scripts/start.mjs` : un lanceur Node, donc il tourne aussi sous Windows (4.1.8). Ce qu’un hébergeur comme Clever Cloud lance.

- Lance : `node scripts/start.mjs`
- Utilisation : `npm start`

<a name="studio"></a>

#### `npm run studio`

Le Studio (`STUDIO=1`), limité à la boucle locale, ouvert sur `/__studio/` : lieux, dialogues, graphe des énigmes, mixage.

- Lance : `tsx tools/select-game.ts && cross-env STUDIO=1 vite --open /__studio/`

<a name="studio-lan"></a>

#### `npm run studio:lan`

Le Studio sur le réseau local, protégé par un jeton de capacité (`tools/serve.ts --lan --studio`).

- Lance : `tsx tools/select-game.ts && tsx tools/serve.ts --lan --studio`

<a name="media"></a>

### Images, sons et pages de relecture

Préparer ce que le contenu cite, écrire les prompts d’images, et les pages qu’une personne relit sur téléphone.

<a name="assets"></a>

#### `npm run assets`

Prépare dans `public/assets/` les images et les sons que le contenu cite : `tools/refs.ts` les liste (lieux, personnages, objets, carte, paramètres des mini-jeux, `skin`, écrans de titre et de crédits, `ending.scratch`, `extraImages`) dans `.cache/refs.json`, puis `python3 tools/assets.py` les convertit (Python 3 avec Pillow) et écrit `games/<GAME>/assets.gen.json`, en ne retraitant que ce qui a changé.

- Lance : `node -e "require('node:fs').mkdirSync('.cache',{recursive:true})" && tsx --tsconfig tsconfig.json tools/refs.ts > .cache/refs.json && python3 tools/assets.py`

<a name="audio"></a>

#### `npm run audio`

La chaîne musique et effets sonores façon Mega Drive (`python3 tools/audio.py` ; [create.music](create.music.md), [create.sound-effects](create.sound-effects.md)).

- Lance : `python3 tools/audio.py`
- Utilisation : `npm run audio -- …`

<a name="code-wheel"></a>

#### `npm run code-wheel`

La roue à codes imprimable d’un jeu (4.1.15) : le grand disque avec les portraits tirés des sprites, le petit disque et ses fenêtres, un livret (montage, la question, réponses d’entraînement tête-bêche), en couleur et en économie ; SVG toujours, PDF avec Pillow (`tools/code-wheel-pdf.py` ; `npm run doctor` le vérifie).

- Lance : `tsx tools/code-wheel.ts`
- Utilisation : `npm run code-wheel -- --game <id> [--format svg|pdf --seed <code> --out <dir>]`

<a name="icons"></a>

#### `npm run icons`

Écrit `public/icons/icon-192.png`, `icon-512.png` et `public/og.png` depuis le `site.json` du jeu (`title`, `ogLines` facultatif : jusqu’à trois lignes au-dessus du titre), sans dépendance.

- Lance : `node scripts/gen-icons.mjs`

<a name="import-layout"></a>

#### `npm run import-layout`

Fusionne dans `games/<id>/layout/<room>.json` les placements exportés de la page de placement. Accepté par fichier : `{ "layouts": { "<room>": Layout } }` (« Export JSON » de la page), `{ "room", "layout" }` (un document de la collection `layouts`), ou une liste de tels documents. `--dry` : dire, ne rien écrire.

- Lance : `tsx --tsconfig tsconfig.json tools/pages/import-layout.ts`
- Utilisation : `npm run import-layout -- <file.json|dir> [--dry]`

<a name="page-placement"></a>

#### `npm run page:placement`

Écrit la page de placement, pour placer depuis un téléphone ; son export revient par `npm run import-layout` ([create.review-pages](create.review-pages.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/pages/placement.ts`
- Utilisation : `npm run page:placement [-- --out <dir|file.html>]`

<a name="page-puzzles"></a>

#### `npm run page:puzzles`

Écrit le graphe des énigmes en page : ce que chaque règle demande et change, une fiche par objet et drapeau ([create.review-pages](create.review-pages.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/pages/puzzles.ts`
- Utilisation : `npm run page:puzzles [-- --out <dir|file.html>]`

<a name="page-review"></a>

#### `npm run page:review`

Écrit la page de relecture des images : chaque case de chaque planche de `games/<id>/art/` en vignette avec une décision garder / refaire / inutilisée et une note, les cases que le jeu utilise marquées avec les ids qui les citent, les ids qu’aucun fichier ne fournit listés comme manquants ([create.review-pages](create.review-pages.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/pages/review.ts`
- Utilisation : `npm run page:review [-- --out <dir|file.html>]`

<a name="page-storyboard"></a>

#### `npm run page:storyboard`

Écrit `games/<id>/storyboard.json` en page pour téléphone avec une zone de notes sous chaque case (`--md` écrit aussi `games/<id>/storyboard.md`, le texte brut que lisent les sous-agents, le même que l’export Markdown du Studio) ([create.review-pages](create.review-pages.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/pages/storyboard.ts`
- Utilisation : `npm run page:storyboard [-- --out <dir|file.html>] [--md]`

<a name="page-world"></a>

#### `npm run page:world`

Écrit la carte du monde en page : sorties, gotos, lieux inaccessibles, la source DOT ([create.review-pages](create.review-pages.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/pages/world.ts`
- Utilisation : `npm run page:world [-- --out <dir|file.html>]`

<a name="prompts"></a>

#### `npm run prompts`

Écrit `games/<id>/prompts.md` : tous les prompts d’images du jeu prêts à coller, une section par planche, avec un bloc STYLE et une planche de référence communs (`games/<id>/art/_reference.png`, ou la planche validée du héros tant qu’elle n’existe pas) ; les cases déjà découpées sont marquées « (exists — keep) ». `--missing` : seulement les planches dont une image n’est pas encore découpée, et seulement leurs cases manquantes ; `--out <fichier>` : un autre fichier de sortie. Il lit le module du jeu et le dossier d’images : personnages (`cast.ts` : la planche de base 6 × 4 avec les lignes de poses du moteur, `human()` ou `cat()` ; les poses spéciales que le contenu utilise — clés `sprites` en plus, `{ pose: [who, p] }` et `{ anim: [who, p] }` dans les lieux, poses des acteurs, `variants` — une nouvelle planche `<sheet>_poses` pour les poses qu’aucun sprite ne fournit encore avec les lignes à ajouter à `cast.ts`, la règle d’assise, le kit de bouches des poses de `mouths`) ; objets (chaque image d’un accessoire, d’un objet, d’un mini-jeu ou de l’interface, par dossier de planche ; les états d’un accessoire dessinés comme « the SAME object, state … ») ; décors (`decor/<name>` : LOCATION, les zones à montrer, les EMPTY SPOTS gauche / centre / droite tirés de `layout/<room>.json`) ; mobilier (accessoires dont l’image est dans un dossier `furniture_*`, et la liste `furniture` d’un lieu) ; et une liste de contrôle (référence → héros → autres personnages → objets → décors → mobilier, chacun avec sa commande `python3 tools/cut-sheet.py`, `--cells` pour les cases manquantes, puis `npm run assets`). Trois champs facultatifs l’alimentent sans rien changer au jeu : `description` d’un personnage (la ligne CHARACTER ; absente, un repère `<describe: …>` reste), `description` d’un lieu (la ligne LOCATION), `furniture` d’un lieu (des ids d’images dessinées sur leur propre planche, par exemple `furniture_dining/table`). L’outil MCP `asset_prompts` (`{ missing?: boolean }`) donne le même texte et les ids manquants en JSON.

- Lance : `tsx --tsconfig tsconfig.json tools/prompts.ts`
- Utilisation : `npm run prompts [-- --missing] [-- --out <file>]`

<a name="seal"></a>

#### `npm run seal`

Chiffre la fin scellée (ticket et carte finale) dans `public/data/dossier.bin`, seulement l’issue choisie (une clé de `outcomes` dans `games/<GAME>/private/ending.config.ts` ; sans lui, l’exemple commité `ending.config.example.ts`). Le mot de passe de la configuration doit être `ending.password` du fichier du jeu.

- Lance : `tsx scripts/seal.ts`
- Utilisation : `npm run seal -- --outcome=<key>`

<a name="checking"></a>

### Vérifier le jeu

Ce qu’un jeu doit passer : la validation, le solveur et ses preuves, le lint, les traductions, les voix, le poids, la provenance, les gates de publication.

<a name="audit-corpus"></a>

#### `npm run audit:corpus`

Les abstractions du solveur face à la recherche explicite sur de nombreux jeux aléatoires (simples, objets libres, trois personnages), chaque nuit : essayés, comparés, partiels, divergents par genre ; sortie 1 sur une divergence. `--shard`/`--merge` répartissent et réunissent les graines (3.7, 3.7.1).

- Lance : `tsx tools/audit-corpus.ts`
- Utilisation : `npm run audit:corpus [-- --seeds=500 --from=1 --max=3000 --json=<file> | --shard=i/n --total=N | --merge a.json b.json …]`

<a name="bench"></a>

#### `npm run bench`

Un jeu généré à la taille donnée, chaque outil chronométré dessus (`--prove` ajoute la preuve exhaustive, `--v3` des ids stables) ; `--workers-table` le tableau des workers de preuve ; `--matrix [--eras]` le tableau de référence de 3.3 ([contribute.benchmarks](contribute.benchmarks.md)).

- Lance : `tsx --tsconfig tsconfig.json tools/bench.ts`
- Utilisation : `npm run bench [-- --rooms=40 --players=3 … --prove --v3 | --workers-table | --matrix [--eras]]`

<a name="i18n"></a>

#### `npm run i18n`

Traductions : `extract` écrit `games/<id>/locales/<lang>.json` (le fichier de référence de la langue de base, ou une traduction gardée, suivie et complétée), `status` la couverture de chaque fichier (un texte identique à la source échoue sauf `i18n: { same: [chemins] }`), `voices` les lignes avec un id sans clip, et les clips qu’aucune ligne ne réclame.

- Lance : `tsx --tsconfig tsconfig.json tools/i18n.ts`
- Utilisation : `npm run i18n -- extract [--lang <xx>] | status | voices`

<a name="ids"></a>

#### `npm run ids`

Des ids stables (schéma 3) pour les règles, sujets, écouteurs, choix, blocs once/nth/cycle/random et étapes de script. Sans option, un essai à blanc. `--write` : dans les sources (`rooms/*.ts`, `rules.ts`, `game.ts`), clés de traduction renommées ; `--map` : `ids.migration.json` et `ids.paths.json`, et les étapes manuelles affichées ; `--lines` : aussi chaque objet say / toast / guide, ligne de liste, indice et réaction par genre (traductions et voix s’y rattachent) ; `--lines=all` : les chaînes simples aussi, exigé pour une version traduite ou doublée.

- Lance : `tsx tools/ids.ts`
- Utilisation : `npm run ids [-- --write] [--map] [--lines | --lines=all]`

<a name="ir"></a>

#### `npm run ir`

La représentation intermédiaire du jeu (4.1.12) : les lieux et ce qui s’y trouve, règles, sujets, écouteurs, scripts, objectifs, chacun avec le `fichier:ligne` qui l’écrit, et l’empreinte des extensions de confiance ; `--json` imprime toute l’IR, le même texte pour les mêmes sources.

- Lance : `tsx tools/ir.ts`
- Utilisation : `npm run ir [-- --game <id> --json]`

<a name="lint"></a>

#### `npm run lint`

Le lint du contenu (alias de `lint:content` depuis 4.1.0) : conditions que rien ne peut satisfaire, règles masquées, fausses pistes, indices bloqués, sujets et options morts, puis après un passage du solveur les actions vivantes jamais jouées et les lieux jamais atteints. Sortie 1 seulement sur une erreur que `GameDef.lint.ignore` n’ignore pas. `--prove` : la recherche exhaustive d’abord ; `--static` : sans solveur.

- Lance : `npm run lint:content --`
- Utilisation : `npm run lint [-- --json | --prove | --static | --max=20000]`

<a name="lint-content"></a>

#### `npm run lint:content`

Le lint du contenu lui-même (`tools/lint.ts`) ; `npm run lint` le lance avec les mêmes arguments, et `npm run quality` le lance en dernier.

- Lance : `tsx tools/lint.ts`
- Utilisation : `npm run lint:content [-- …]`

<a name="migrate"></a>

#### `npm run migrate`

Un projet de jeu amené à cette version (`quest-n-click migrate`) : un schéma plus ancien reçoit ses ids stables et les étapes manuelles s’affichent ; depuis 4.3.0 il renomme d’abord les imports `web-scumm/…` de l’ancien nom, les chemins du tsconfig et les commandes `web-scumm` des scripts (`--check` les nomme).

- Lance : `tsx tools/migrate.ts`
- Utilisation : `npm run migrate [-- --check]`

<a name="playtests"></a>

#### `npm run playtests`

Rejoue chaque session partagée par des joueurs (`games/<id>/playtests/`) sur le contenu actuel et les résume : temps par lieu, blocages, indices, où ils se sont arrêtés, une carte de chaleur sur le graphe des énigmes. Une session qui diverge est signalée (la réenregistrer ou la supprimer) ; `--strict` (le gate de publication) en fait une erreur, sortie 1, et n’exige aucun nombre de sessions. Quotas de terrain (3.7.1) : `--require=N` sessions, `--require-completed=N`, `--require-devices=N` familles d’appareils ; un quota manqué est une erreur. Aucun fichier : sortie 0.

- Lance : `tsx tools/playtests.ts`
- Utilisation : `npm run playtests [-- --json --strict --require=N --require-completed=N --require-devices=N --dir=games/<id>/playtests --out=.cache/playtests]`

<a name="prove-game"></a>

#### `npm run prove:game`

Le gate exhaustif des blocages : la preuve, la preuve par chapitres, puis `solve:reality` ; échoue sur un blocage ou une troncature. `release-check` le lance.

- Lance : `npm run solve -- --prove && npm run solve -- --prove --chapters && npm run solve:reality`

<a name="prove-matrix"></a>

#### `npm run prove:matrix`

La matrice de preuve (4.1.13) : douze jeux générés à trois personnages, chacun prouvé dans son propre processus sous les budgets publiés ; une ligne chacun (verdict, verdict attendu, états, temps, pic mémoire). Sortie 1 sur un verdict faux ; hors budget, c’est `unknown`, jamais `proved`. La nuit seulement.

- Lance : `tsx tools/prove-matrix.ts`
- Utilisation : `npm run prove:matrix [-- --only=c11,o21 --time=600 --max=10000000 --mem=4096 --json=<file> --profile=<file>]`

<a name="provenance"></a>

#### `npm run provenance`

Les assets publiés par licence et ce qui a changé depuis le verrou relu ; `--lock` écrit `games/<id>/provenance.lock.json` (SHA-256 et taille de chaque fichier) après une relecture. Sortie 0 propre, 1 quelque chose à relire.

- Lance : `tsx tools/provenance.ts`
- Utilisation : `npm run provenance [-- --lock]`

<a name="remix"></a>

#### `npm run remix`

Un monde Remix du jeu courant (4.1.15) : `--seed` affiche la valeur de chaque dimension et l’empreinte du monde (`--json` tout le `WorldVariant`), `--preview` ajoute validate et un témoin du solveur sur ce monde, `--record=N` résout les N premières graines de l’échantillon publié et écrit chacune comme session de playtest portant son monde (`games/<id>/playtests/remix-<seed>.session.json`).

- Lance : `tsx tools/remix.ts`
- Utilisation : `npm run remix -- --seed <code> [--mode=remix --json] | --preview <code> [--max=N] | --record=N`

<a name="replay"></a>

#### `npm run replay`

Joue une session exportée du jeu (réglages › sauvegarde › « Exporter la session », l’onglet Jouer du Studio, le panneau DEV) sur le vrai moteur sans affichage ; affiche le journal, le journal sémantique (4.1.11) et l’état final ; sortie 1 là où la relecture cesse de correspondre à l’enregistrement ou si son journal sémantique diffère de celui du fichier.

- Lance : `tsx tools/replay.ts`
- Utilisation : `npm run replay -- <session.json> [--upTo=N] [--json]`

<a name="solve"></a>

#### `npm run solve`

Le solveur : un témoin rapide que le jeu peut être fini depuis Nouvelle partie. `--prove` : la preuve exhaustive des états atteignables, blocages signalés. Autres options : `--from=<checkpoint>`, `--max=<états>`, `--chapters` (une recherche bornée par checkpoint qui a des `goals` ; avec `--prove`, chaque chapitre prouvé depuis chaque état frontière atteignable), `--goal=100%` (chaque objectif non facultatif, 4.1.12 ; sortie 2 pour un jeu qui n’en déclare aucun), `--json`, `--profile`, `--por=sleep|stubborn`, `--workers=N|auto [--batch=64]`, `--time=<s>`, `--mem=<Mo>`, `--ownership=off`, `--dominance`, `--symmetry`, `--representation=objects`, `--checkpoint=<fichier> [--checkpoint-every=300] [--resume]`, `--audit-abstractions`. Sortie 0 résolu, 2 tronqué (rien n’est prouvé : augmenter le budget), 1 sinon ([reference.error-codes](reference.error-codes.md#solver)) ; voir [create.solver-options](create.solver-options.md).

- Lance : `tsx tools/solve.ts`
- Utilisation : `npm run solve [-- --prove | --from=<checkpoint> | --max=<n> | --chapters | --goal=100% | --json | --profile …]`

<a name="solve-reality"></a>

#### `npm run solve:reality`

Un jeu qui reçoit des signaux de l’extérieur, prouvé dans chaque monde qu’il peut rencontrer (4.1.1) : fermé (par le repli de chaque signal requis), chaque scénario de `games/<id>/reality/scenarios/*.json`, chaque replay enregistré de `games/<id>/replays/` (4.1.9), et adversarial.

- Lance : `tsx tools/solve-reality.ts`
- Utilisation : `npm run solve:reality [-- --json]`

<a name="validate"></a>

#### `npm run validate`

Vérifie le contenu du jeu : références cassées, texte vide ou trop long, lignes Regarder manquantes, drapeaux jamais posés ou jamais lus. Sortie 1 pour un problème bloquant. `--report` : le profileur de contenu (lieux, objets, personnages, ce qui est maigre, en Markdown). `--release` : aussi la provenance des assets (`games/<id>/provenance.json` exigé, un asset provisoire est une erreur sauf exception qui le nomme) et un id stable sur chaque ligne d’un jeu publié dans une autre langue que la sienne ou doublé. `--commercial` : aucune exception, aucun provisoire, aucune licence non commerciale, chaque source vérifiable.

- Lance : `tsx tools/validate.ts`
- Utilisation : `npm run validate [-- --report | --release | --commercial [--errors]]`

<a name="verify-commercial"></a>

#### `npm run verify:commercial`

verify:release, puis `validate --commercial --errors` (aucune exception, aucun provisoire, aucune licence NC/ND, chaque source vérifiable), puis verify:dist.

- Lance : `npm run verify:release && npm run validate -- --commercial --errors && npm run verify:dist`

<a name="verify-dist"></a>

#### `npm run verify:dist`

Chaque fichier du jeu construit justifié (3.7.1) : code du moteur, assets verrouillés de ce jeu (leurs octets relus), données nommées, polices, icônes, notices sous `licenses/` ; tout autre fichier, ou un fichier verrouillé manquant, échoue.

- Lance : `tsx tools/dist.ts`
- Utilisation : `npm run verify:dist [-- --dir=dist] [--json]`

<a name="verify-field"></a>

#### `npm run verify:field`

verify:commercial, puis les playtests stricts avec les quotas de terrain (`--require=5 --require-completed=3 --require-devices=2`) : ce qu’exige une version testée par des joueurs ; pas une étape de release-check (D12).

- Lance : `npm run verify:commercial && npm run playtests -- --strict --require=5 --require-completed=3 --require-devices=2`

<a name="verify-game"></a>

#### `npm run verify:game`

Les gates du jeu : validate, solve, solve par chapitres, verify:variants, i18n status, lint, playtests. Une étape de `build:game`.

- Lance : `npm run validate && npm run solve && npm run solve -- --chapters && npm run verify:variants && npm run i18n -- status && npm run lint && npm run playtests`

<a name="verify-release"></a>

#### `npm run verify:release`

validate `--release`, weight `--release`, i18n status, voices check `--release`, playtests stricts : une étape de `release-check`.

- Lance : `npm run validate -- --release && npm run weight -- --release && npm run i18n -- status && npm run voices -- check --release && npm run playtests -- --strict`

<a name="verify-variants"></a>

#### `npm run verify:variants`

Chaque monde de chaque mode Remix (4.1.15, D25) : tout monde logique d’un catalogue, l’échantillon publié d’un générateur, chacun validé et résolu jusqu’à la fin et à chaque objectif (`--prove` : la preuve exhaustive), un certificat par monde dans `.cache/proofs/variants/`, la couverture par dimension et par paire, les valeurs jamais tirées, les dominantes ; `--out` écrit le rapport qu’une version publie ; sortie 1 si un monde échoue. Partie de verify:game.

- Lance : `tsx tools/verify-variants.ts`
- Utilisation : `npm run verify:variants [-- --prove --max=N --sample=50 --draws=1000 --out=<file>]`

<a name="voices"></a>

#### `npm run voices`

Le tableau de production des voix : `status` par langue (lignes par statut draft, record, recorded, approved ; une ligne à aiguillages a une ligne par valeur, `<id>~form=f`), `export` le tableau pour les comédiens (CSV ou JSON), `import` leurs statuts, comédiens et notes dans `voices.json` (sortie 1 sur une ligne ou un statut inconnu), `check` chaque clip mesuré par ffmpeg (codec, fréquence, durée, sonie ≈ −16 LUFS, crête ; sortie 1 sur une erreur ; `--release` : une ligne approuvée exige son clip).

- Lance : `tsx tools/voices.ts`
- Utilisation : `npm run voices -- status [--lang xx] | export --lang xx [--json] | import <file> --lang xx | check [--lang xx] [--release]`

<a name="weight"></a>

#### `npm run weight`

Ce qu’un téléphone télécharge avant que le premier lieu soit jouable, par lieu et par chapitre, face à `assetBudgets` (`initialKB`, `roomKB`, `chapterKB`), d’après les fichiers construits et le graphe des assets. Sortie 0 dans le budget, 1 au-delà ou fichier manquant (`--release` : ou budget non posé). `--stems` compte les pistes séparées des partitions.

- Lance : `tsx tools/weight.ts`
- Utilisation : `npm run weight [-- --release --json --stems]`

<a name="tests"></a>

### Tests et qualité du code

Les suites de tests du moteur, ses ensembles de mutation, le formatage, les types et la base de qualité.

<a name="check"></a>

#### `npm run check`

Pointe `.cache/game` vers le jeu courant, vérifie les types (`tsc --noEmit`), puis lance `test:node`.

- Lance : `tsx tools/select-game.ts && npm run -s tsc -- --noEmit && npm run test:node`

<a name="doctor"></a>

#### `npm run doctor`

Un rapport exploitable des prérequis, sans rien installer : Node et Chromium exigés ; Python, ses modules, ffmpeg et WebKit facultatifs. `--release` (4.1.8) exige Python, ses modules et ffmpeg comme release-check, et Chromium comme toujours ; Firefox et WebKit restent facultatifs.

- Lance : `tsx tools/doctor.ts`
- Utilisation : `npm run doctor [-- --release]`

<a name="format"></a>

#### `npm run format`

Le formatage Biome, écrit (`biome format --write .`).

- Lance : `biome format --write .`

<a name="format-check"></a>

#### `npm run format:check`

Le formatage Biome, vérifié sans écrire (`npm run quality` le lance).

- Lance : `biome format .`

<a name="lint-code"></a>

#### `npm run lint:code`

Le lint Biome du code seul (`biome lint .`).

- Lance : `biome lint .`

<a name="quality"></a>

#### `npm run quality`

Le gate du code du moteur (4.1.0) : formatage et lint Biome, knip (fichiers et exports inutilisés), types avec `tsconfig.json` et `tsconfig.strictest.json`, puis le lint du contenu.

- Lance : `npm run format:check && npm run lint:code && knip --no-progress && npm run -s tsc -- --noEmit && npm run -s tsc -- --noEmit -p tsconfig.strictest.json && npm run lint:content`

<a name="quality-baseline"></a>

#### `npm run quality:baseline`

Le comportement de 4.0.0 conservé (4.1.0) : pour la démo, le jeu de référence, l’exemple des héros et les jeux de test du solveur, le témoin et la preuve, chaque sauvegarde de référence jouée jusqu’au bout, la surface publique de l’API et du MCP, la première visite (`tests/quality-baseline.json`). `--check` compare ; sans lui, il écrit le fichier et les trois chiffres des README : un nouveau test ou un bundle plus léger impose de le lancer (4.1.8).

- Lance : `tsx tools/quality-baseline.ts`
- Utilisation : `npm run quality:baseline [-- --check] [--dist=dist]`

<a name="test"></a>

#### `npm run test`

Lance `test:node` : les tests Node du moteur et des outils et ceux du jeu choisi, sans les tests lourds du solveur ni ceux liés à Python.

- Lance : `npm run test:node`
- Utilisation : `npm test`

<a name="test-assets"></a>

#### `npm run test:assets`

Les tests d’images et de la chaîne d’assets qui passent par Python (`tests/pixel.test.ts`, `tests/studio-assets.test.ts`).

- Lance : `vitest run tests/pixel.test.ts tests/studio-assets.test.ts`

<a name="test-coverage"></a>

#### `npm run test:coverage`

La suite sous couverture V8 (sans les tests lourds), face aux planchers de `vite.config.ts` ; puis `npx tsx tools/coverage-ratchet.ts --strict` échoue sur un plancher en retard d’au moins trois points sur ce que les tests atteignent (CI sur main et les tags, release-check, 4.1.8 ; un avertissement sur une pull request, 4.1.9).

- Lance : `vitest run --coverage --exclude tests/ownership.test.ts --exclude tests/audit.test.ts --exclude tests/canonical.test.ts --exclude tests/memo.test.ts --exclude tests/reference-proof.test.ts --exclude tests/solver-oracle.test.ts --exclude tests/dominance.test.ts --exclude tests/partition.test.ts --exclude tests/checkpoint-matrix.test.ts`

<a name="test-heavy"></a>

#### `npm run test:heavy`

Les tests du solveur qui saturent le processeur (audits d’abstraction, propriétaire canonique, preuves de mémo et de propriété, la preuve du chapitre de référence, dominance, partition, matrice de checkpoints), un fichier à la fois : la nuit, plusieurs minutes chacun.

- Lance : `vitest run --no-file-parallelism tests/ownership.test.ts tests/audit.test.ts tests/canonical.test.ts tests/memo.test.ts tests/reference-proof.test.ts tests/solver-oracle.test.ts tests/dominance.test.ts tests/partition.test.ts tests/checkpoint-matrix.test.ts`

<a name="test-mutation-core"></a>

#### `npm run test:mutation:core`

Les tests de mutation des modules dont dépendent une sauvegarde, une session, une condition, un signal, une course ou un store, et des parties pures des connecteurs (SDK, lecteur MIME, éditeur de ligne, disque virtuel, cryptographie et récupération des badges : `connectors-pure`, que `connectors` nomme encore jusqu’à 4.2). Tous les ensembles sont des gates depuis 4.1.20, dont `reality-store-postgres` (l’adaptateur Postgres, sur un Postgres) et `connectors-edge` (configuration, email, vérification des badges, garde et shell du terminal, SSH, Telnet, en 4 tranches). 4.1.20 : `--shard=i/n` mute une tranche (des fichiers entiers, une découpe déterministe équilibrée sur leurs mutants) et `--merge` réunit les tranches d’un ensemble en son rapport, en refusant une tranche manquante, en double, annulée ou d’autres entrées ; ci, la nuit, le candidat et la publication lancent une matrice générée par `npx tsx tools/mutation-shards.ts --matrix=gated|nightly`. Chaque entrée de `docs/dev/mutants.json` a une catégorie, une raison, une preuve, un responsable et une version de révision, refusée à partir de cette version (une entrée échue arrête tous les ensembles). Une exécution qui mute `reality-store-postgres` (`--set=all` compris, donc release-check) exige `BRIDGE_PG_URL`. Un rapport dont l’empreinte des entrées (sources, tests, configurations, lockfile) est l’actuelle est réutilisé sauf `--fresh` ; `--hash` affiche cette empreinte (la clé du cache de CI) ; `--doc` écrit le tableau des survivants nommés dans docs/dev/MUTANTS.md.

- Lance : `tsx tools/mutate.ts`
- Utilisation : `npm run test:mutation:core [-- --set=core|reality|runs|remix|speedrun|connectors-pure|reality-store|connectors-edge|reality-store-postgres|all --file=… --shard=i/n --merge [--from=…] --fresh --hash --doc]`

<a name="test-mutation-reality"></a>

#### `npm run test:mutation:reality`

Un ensemble de mutation (4.1.16) : le chemin des signaux Reality. `core`, `reality`, `runs`, `remix` et `speedrun` sont des gates depuis 4.1.17 (`--set=all`, un job chacun en ci avec `full-ci`, la nuit, le candidat et la publication).

- Lance : `tsx tools/mutate.ts --set=reality`

<a name="test-mutation-remix"></a>

#### `npm run test:mutation:remix`

Un ensemble de mutation (4.1.16) : la graine, l’empreinte, la compilation, l’application, les contraintes, la catégorie et les jetons Daily/Mystery d’un monde. `core`, `reality`, `runs`, `remix` et `speedrun` sont des gates depuis 4.1.17 (`--set=all`, un job chacun en ci avec `full-ci`, la nuit, le candidat et la publication).

- Lance : `tsx tools/mutate.ts --set=remix`

<a name="test-mutation-runs"></a>

#### `npm run test:mutation:runs`

L’ensemble de mutation de la file des speedruns (4.1.17) : admission, quota et classement (`bridge/src/runs.ts`, `runs-store.ts`, `runs-limiter.ts`), jugé par les quatre fichiers de tests courts des courses du Bridge ; gate dès le départ (`--set=all`, la publication, un job à lui).

- Lance : `tsx tools/mutate.ts --set=runs`

<a name="test-mutation-speedrun"></a>

#### `npm run test:mutation:speedrun`

Un ensemble de mutation (4.1.16) : l’enveloppe et le `h0` d’une course, l’enregistreur et le vérificateur. `core`, `reality`, `runs`, `remix` et `speedrun` sont des gates depuis 4.1.17 (`--set=all`, un job chacun en ci avec `full-ci`, la nuit, le candidat et la publication).

- Lance : `tsx tools/mutate.ts --set=speedrun`

<a name="test-node"></a>

#### `npm run test:node`

La suite unitaire sans les tests liés à Python (`tests/pixel.test.ts`, `tests/studio-assets.test.ts`) ni ceux qui saturent le processeur (les fichiers de `test:heavy`) ; `npm run check` la lance, les lourds tournent la nuit.

- Lance : `vitest run --exclude tests/pixel.test.ts --exclude tests/studio-assets.test.ts --exclude tests/ownership.test.ts --exclude tests/audit.test.ts --exclude tests/canonical.test.ts --exclude tests/memo.test.ts --exclude tests/reference-proof.test.ts --exclude tests/solver-oracle.test.ts --exclude tests/dominance.test.ts --exclude tests/partition.test.ts --exclude tests/checkpoint-matrix.test.ts`

<a name="tsc"></a>

#### `npm run tsc`

Le compilateur TypeScript 7 lui-même (4.1.8 ; le lien `tsc` peut appartenir au paquet typescript6 des outils) : `check` et `quality` l’appellent.

- Lance : `node node_modules/typescript/bin/tsc`
- Utilisation : `npm run tsc -- …`

<a name="browser-tests"></a>

### Tests dans le navigateur (e2e)

Chacun fait tourner le produit dans un vrai navigateur avec Playwright (`npm run doctor` dit quels navigateurs sont installés). Un navigateur qui ne se lance pas sort en 3 là où le script le dit (0 avec `--allow-skip`).

<a name="e2e"></a>

#### `npm run e2e`

Une partie jouée au toucher dans un navigateur à la taille d’un téléphone (`E2E_BROWSER=chromium|webkit|firefox` ; captures dans `E2E_OUT`, par défaut `/tmp/e2e`) ; le serveur doit déjà répondre à l’URL. Le `games/<id>/e2e.mjs` propre au jeu (qui exporte `run(harness)`) est utilisé s’il existe, sinon le chemin du solveur (`npm run solve -- --json`) est joué au toucher. `--renderer canvas` : tout le jeu dessiné par le peintre Canvas ; `--lang <xx>` : tout le jeu dans cette langue, en échouant sur tout texte anglais par défaut du moteur resté visible.

- Lance : `node scripts/e2e.mjs`
- Utilisation : `npm run e2e -- [url] [--game <id>] [--at=<checkpoint>] [--prod] [--generic] [--keyboard] [--renderer canvas] [--lang <xx>]`

<a name="e2e-a11y"></a>

#### `npm run e2e:a11y`

Les gates d’accessibilité et de stockage dans un vrai navigateur (`E2E_BROWSER=chromium|webkit`) sur le build de production du jeu d’exemple : axe sur la conversation, la carte, les emplacements, les confirmations et chaque mini-jeu ; chaque mini-jeu gagné au clavier ; une ancienne sauvegarde mise à niveau. Sortie 3 : une vérification que le navigateur ne sait pas automatiser.

- Lance : `node scripts/e2e-a11y.mjs`
- Utilisation : `npm run e2e:a11y -- <url> [--only=axe,keys,storage] [--allow-skip]`

<a name="e2e-canonical"></a>

#### `npm run e2e:canonical`

`canonicalJson` (`src/engine/core/canonical.ts`, 4.1.12) sur cinquante valeurs limites dans Chromium, WebKit et Firefox, face aux textes qu’écrit Node : un navigateur qui écrit une valeur autrement échoue ; sortie 3 quand un navigateur ne se lance pas (0 avec `--allow-skip`).

- Lance : `node scripts/e2e-canonical.mjs`
- Utilisation : `npm run e2e:canonical [-- --browsers=chromium,webkit,firefox --allow-skip]`

<a name="e2e-music"></a>

#### `npm run e2e:music`

Les gates du directeur musical (3.5) sur le build de production servi : 30 minutes hors ligne sans dérive, 100 changements sans clic, gigue en temps réel, les pistes du thème dans le jeu ; `--only=reference` (GAME=reference) : deux partitions, des ponts, une restauration et un arrêt en pleine transition, la crête décodée (Chromium et WebKit, 3.8).

- Lance : `node scripts/e2e-music.mjs`
- Utilisation : `npm run e2e:music -- <url> [--only=offline|live|game|reference --live=chromium|webkit --browser=webkit]`

<a name="e2e-perf"></a>

#### `npm run e2e:perf`

Images par seconde pendant que le héros marche, le processeur ralenti (4× par défaut, le substitut du téléphone) ; échoue sous `--min` (30 par défaut).

- Lance : `node scripts/e2e-perf.mjs`
- Utilisation : `npm run e2e:perf -- <url> [--renderer=canvas|dom --cpu=4 --min=30 --room=<id> --seconds=5]`

<a name="e2e-pwa"></a>

#### `npm run e2e:pwa`

La PWA dans un vrai navigateur (`E2E_BROWSER`) : installée, tout le jeu préchargé puis ouvert hors ligne. Avec `--serve=dist` le script sert lui-même le build et peut en publier un second : `--update` (la bannière, la sauvegarde gardée, le nouveau worker aux commandes), `--interrupted` (le chargement du worker échoue : pas de bannière, l’ancien sert), `--reinstall` (worker et caches supprimés, réinstallés, la sauvegarde gardée) ; `--allow-skip` accepte la navigation hors ligne de WebKit, que Playwright ne sait pas piloter.

- Lance : `node scripts/e2e-pwa.mjs`
- Utilisation : `npm run e2e:pwa [-- --serve=dist --update --interrupted --reinstall --allow-skip]`

<a name="e2e-reality"></a>

#### `npm run e2e:reality`

Le Reality Bridge de bout en bout sur le build de production de `games/signals` et un vrai Bridge de référence qu’il lance sur 127.0.0.1:8787 (4.1.1) : appairage, le même webhook deux fois, hors ligne, retour en ligne, le signal appliqué une fois, la session rejouée ; depuis 4.1.9 deux connecteurs et les replays du chapitre d’exemple.

- Lance : `node scripts/e2e-reality.mjs`
- Utilisation : `npm run e2e:reality -- <url> [--browser=chromium|webkit]`

<a name="e2e-remix"></a>

#### `npm run e2e:remix`

La même graine donne le même monde, la même empreinte et la même roue à codes dans Node, Chromium, WebKit et Firefox (4.1.15, ADR 0018) : 50 graines de la référence dans trois modes ; un navigateur qui diffère échoue, la graine nommée ; sortie 3 quand un navigateur ne se lance pas (0 avec `--allow-skip`).

- Lance : `node scripts/e2e-remix.mjs`
- Utilisation : `npm run e2e:remix [-- --browsers=chromium,webkit,firefox --seeds=50 --allow-skip]`

<a name="e2e-remix-speedrun"></a>

#### `npm run e2e:remix-speedrun`

Remix et Time Attack ensemble (4.1.16) : pour chaque politique de monde de la référence (Story, Remix Fixed, Remix Random, Daily, Mystery) le monde construit, la route du solveur enregistrée par le vrai enregistreur dans Node, Chromium, WebKit et Firefox (les quatre `.wsrun` identiques à l’octet), vérifiée dans un nouveau processus, puis par le worker isolé d’une file du Bridge : verdict, clé de classement, confiance ; sortie 3 quand un navigateur ne se lance pas (0 avec `--allow-skip`).

- Lance : `tsx scripts/e2e-remix-speedrun.ts`
- Utilisation : `npm run e2e:remix-speedrun [-- --browsers=chromium,webkit,firefox --allow-skip]`

<a name="e2e-smoke"></a>

#### `npm run e2e:smoke`

La partie générique sur le build de production (`e2e.mjs --generic --prod`) : le chemin du solveur rejoué au toucher.

- Lance : `node scripts/e2e.mjs --generic --prod`

<a name="e2e-speedrun"></a>

#### `npm run e2e:speedrun`

Le déterminisme du speedrun dans Chromium (aussi avec un processeur quatre fois plus lent), WebKit et Firefox (4.1.14) : les vecteurs du générateur, la course de référence rejouée jusqu’au même état final, IGT et preuve finale, une course reprise depuis IndexedDB après fermeture de son onglet ; sortie 3 quand un navigateur ne se lance pas (0 avec `--allow-skip`).

- Lance : `node scripts/e2e-speedrun.mjs`
- Utilisation : `npm run e2e:speedrun [-- --browsers=chromium,webkit,firefox --allow-skip --bundle-only]`

<a name="e2e-studio"></a>

#### `npm run e2e:studio`

Le Studio dans un navigateur sur le serveur de dev : une mise en scène éditée sans JSON à la main (le formulaire, l’aperçu du diff, Appliquer validé par le serveur, Annuler), le fichier du lieu restauré dans tous les cas.

- Lance : `node scripts/e2e-studio.mjs`

<a name="e2e-studio-collab"></a>

#### `npm run e2e:studio-collab`

Trois personnes sur un même Studio hébergé (4.2.1, le job `studio-hosted` de la CI ; `studio-client` d’abord) : présence, une zone tenue par un autre refusée avec le brouillon gardé, un relecteur empêché d’écrire, une coupure rattrapée depuis le journal, l’écran des membres, les pages de connexion et « accès non accordé ».

- Lance : `tsx scripts/e2e-studio-collab.ts`
- Utilisation : `npm run e2e:studio-collab [-- --browser=firefox|webkit]`

<a name="e2e-studio-hosted"></a>

#### `npm run e2e:studio-hosted`

Le Studio hébergé dans un navigateur (4.2.1, le job `studio-hosted` de la CI ; `studio-client` d’abord) : connexion, l’éditeur de lieu sur l’origine du jeu, sa sauvegarde via le Studio, le mur entre les deux origines, Jouer, déconnexion (Firefox et WebKit en https ; WebKit sous macOS seulement).

- Lance : `tsx scripts/e2e-studio-hosted.ts`
- Utilisation : `npm run e2e:studio-hosted [-- --browser=firefox|webkit]`

<a name="e2e-taps"></a>

#### `npm run e2e:taps`

Les verbes par défaut dans le navigateur, sur le chapitre de référence (4.0, GAME=reference) : un double toucher sur une sortie la franchit, sur un personnage lui parle ; un objet pris dans le sac est donné à un personnage, utilisé sur tout le reste.

- Lance : `node scripts/e2e-taps.mjs`
- Utilisation : `npm run e2e:taps -- <url> [--browser=chromium|webkit]`

<a name="e2e-visual"></a>

#### `npm run e2e:visual`

Chaque lieu, à l’arrêt, face à `tests/visual/<game>/<room>.png` (la scène seule, animations figées) ; plus de 0,5 % des pixels changés échoue ; `--update` écrit les références. Le build de production doit être servi.

- Lance : `node scripts/e2e-visual.mjs`
- Utilisation : `npm run e2e:visual -- <url> [--update] [--tolerance=0.005]`

<a name="e2e-weight"></a>

#### `npm run e2e:weight`

Le budget de poids face aux octets qu’un navigateur transfère vraiment : une première visite du build de production dans Chromium, du titre au premier lieu jouable ; une requête hors du périmètre initial prévu (`npm run weight -- --json`) échoue.

- Lance : `node scripts/e2e-weight.mjs`
- Utilisation : `npm run e2e:weight -- <url>`

<a name="e2e-worker-container"></a>

#### `npm run e2e:worker-container`

Le worker de speedrun dans son profil de conteneur (4.1.17, Linux avec Docker, le job `worker-container` de la CI) : la course de référence vérifiée dedans ; un script hostile privé de HTTP, DNS, TCP, d’écriture hors de `/tmp` et des secrets de l’hôte, son processus enfant sans réseau, tous tués par le délai du conteneur lui-même ; puis une course à nouveau. `node tools/speedrun/container.mjs --image= --app= [--games=] [--allow-network]` affiche le profil sous forme de commande `worker`.

- Lance : `tsx scripts/e2e-worker-container.ts`
- Utilisation : `npm run e2e:worker-container [-- --image=node:22-bookworm-slim]`

<a name="release"></a>

### Construire, empaqueter et publier

Le build, les archives qu’une version publie, les vérifications d’un candidat, les passes des personnes (Field Kit) et la chaîne de publication.

<a name="audit"></a>

#### `npm run audit`

Lance `audit:assets`.

- Lance : `npm run audit:assets`

<a name="audit-assets"></a>

#### `npm run audit:assets`

Fait échouer le build si quelque chose du projet privé d’origine fuit dans le dépôt public (noms de vraies personnes, ids de planches privées, nom du projet privé), les mots bloqués gardés en préfixes SHA-1. Un jeu peut autoriser certains de ces mots dans ses propres fichiers, par leur préfixe SHA-1 et une raison, dans `games/<id>/audit-allow.json` ([create.build-release](create.build-release.md#audit-allow)). `build:game` le lance. Les licences des fichiers de `dist/` relèvent de `verify:dist`.

- Lance : `tsx tools/audit-assets.ts`

<a name="audit-deps"></a>

#### `npm run audit:deps`

`npm audit --omit=dev` : les alertes des dépendances d’exécution (CI sur main et release-check).

- Lance : `npm audit --omit=dev`

<a name="build"></a>

#### `npm run build`

`npm run check` (types et tests Node), puis `build:game` : le `dist/` statique (le jeu, ses assets, le service worker). Il exige un témoin gagnant.

- Lance : `npm run check && npm run build:game`

<a name="build-game"></a>

#### `npm run build:game`

Les gates du jeu (verify:game), le bundle Vite, verify:dist, la vérification des spoilers, l’audit de fuite (`audit:assets`) : ni tsc ni suite unitaire (la CI les lance une fois).

- Lance : `npm run verify:game && vite build && npm run verify:dist && npm run check:spoilers && npm run audit:assets`

<a name="build-web"></a>

#### `npm run build:web`

`vite build` seul, sans gate : ce qu’un hébergeur lance après sa propre installation (sur Clever Cloud, `CC_POST_BUILD_HOOK=npm run build:web`).

- Lance : `vite build`

<a name="check-spoilers"></a>

#### `npm run check:spoilers`

Vérifie qu’aucun texte de la fin scellée, quelle que soit l’issue, n’apparaît en clair dans `dist/`.

- Lance : `tsx scripts/check-spoilers.ts`

<a name="connector-archive-e2e"></a>

#### `npm run connector-archive-e2e`

Les quatre connecteurs joués de bout en bout depuis leur archive face à un Bridge depuis la sienne (4.1.19) : email par webhook et par IMAP (un serveur propre au script), Telnet, SSH et Open Badge ; le job `connector-archive-e2e` du candidat. Les vrais fournisseurs et l’exposition restent une passe humaine (`connectors-real-security`).

- Lance : `node scripts/connector-archive-e2e.mjs`
- Utilisation : `npm run connector-archive-e2e -- [--tarballs=<dir>] [--keep]`

<a name="external-consumer"></a>

#### `npm run external-consumer`

Les quatre archives utilisées comme un tiers les utilise, sous Linux, macOS et Windows (4.1.18) : lues (noms, versions, licences, exécutables, exports, dépendances), un jeu fait sur l’ancienne version amené à elles (depuis 4.3.0 comme son auteur le ferait : l’ancien paquet `web-scumm` désinstallé, `quest-n-click` installé, migrate, verify, build, sa sauvegarde et une nouvelle partie jouées jusqu’au bout via `@quest-n-click/engine/testing`), `create-quest-n-click`, le Bridge (SQLite, Postgres avec `CONSUMER_PG_URL`) et un scénario de connecteur (un code d’appairage, une lettre signée acceptée, son doublon, une contrefaçon refusée) ; aucun module du dépôt. Le candidat le lance sur ses propres archives.

- Lance : `node scripts/external-consumer.mjs`
- Utilisation : `npm run external-consumer -- [--tarballs=<dir>] [--from=4.1.17] [--dir=<folder>] [--keep]`

<a name="field-bundle"></a>

#### `npm run field:bundle`

Un rapport et ses preuves listées dans une archive, journaux caviardés, refusé sur une clé ou un jeton. ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts bundle`
- Utilisation : `npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>`

<a name="field-carry"></a>

#### `npm run field:carry`

4.1.20 (ADR 0024) : une passe reportée sur un nouveau candidat quand aucun fichier de sa surface n’a changé (version comprise) : une attestation en attente que le mainteneur approuve dans un commit signé ; `--check-range=<a..b>` refuse une plage qui change à la fois la racine de confiance et une attestation. ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts carry`
- Utilisation : `npm run field:carry -- --from=<folder> --to=<folder> --pass=<id> [--check-range=<a..b>]`

<a name="field-check"></a>

#### `npm run field:check`

Chaque rapport de passe vérifié face à son candidat (commit, exécution, empreintes), le SHA-256 de ses preuves et la recherche de fuites. ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts check`
- Utilisation : `npm run field:check -- --dir=<folder> [--require=<id,…>]`

<a name="field-init"></a>

#### `npm run field:init`

Le Field Kit (4.1.18) : les passes humaines en rapports JSON à `not-run`, liés à cette exécution candidate. ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts init`
- Utilisation : `npm run field:init -- --release=<x.y.z> --candidate=<run id>`

<a name="field-report"></a>

#### `npm run field:report`

Le tableau des passes humaines généré depuis les rapports. ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts report`
- Utilisation : `npm run field:report -- --dir=<folder> --out=docs/dev/passes/<x.y.z>.md`

<a name="field-verify-bundle"></a>

#### `npm run field:verify-bundle`

4.1.19 : l’intégrité d’une archive de passe, son candidat, puis qui a fait son manifeste (son attestation, ou l’exécution). ([contribute.field-passes](contribute.field-passes.md))

- Lance : `tsx tools/field/field.ts verify-bundle`
- Utilisation : `npm run field:verify-bundle -- <bundle.tar.gz> [--offline --trusted-root=<file>]`

<a name="fresh-install"></a>

#### `npm run fresh-install`

Le moteur utilisé comme un autre projet l’utilise (3.9) : un jeu créé depuis le modèle empaqueté hors du dépôt, l’archive installée, ses propres `assets`, `verify` et `build`, puis joué jusqu’à la fin dans un navigateur ; `create-quest-n-click` installé depuis son archive et lancé, le Bridge installé et qui sert, les connecteurs installés sans code natif et qui répondent à `--help`. La CI le lance.

- Lance : `node scripts/fresh-install.mjs`
- Utilisation : `npm run fresh-install [-- --dir=<folder>] [--keep]`

<a name="locks"></a>

#### `npm run locks`

Les verrous versionnés du Bridge, des connecteurs et de l’image du Bridge (`scripts/locks/`, 4.1.19), faits depuis le verrou racine (chaque version gardée) ; `--check` dit si chacun correspond encore à son manifeste et au verrou racine, sans réseau. `scripts/pack.mjs` les copie dans les archives comme `npm-shrinkwrap.json` ; `scripts/sbom.mjs` et `scripts/bridge-image.mjs` font les cinq SBOM CycloneDX du candidat et son image. À lancer quand une dépendance de ces paquets change, relire le diff, le commiter.

- Lance : `node scripts/locks.mjs`
- Utilisation : `npm run locks [-- --check]`

<a name="ops-qualify"></a>

#### `npm run ops:qualify`

Le profil de qualification du Bridge (`ops/qualify/`, 4.1.18) construit depuis l’archive et monté derrière HTTPS sur Docker : trois instances sur un Postgres, deux tenants, une instance tuée pendant des propositions, un flux sur une autre, les tenants séparés, sauvegarde, la topologie détruite et restaurée, puis (4.1.20) une restauration refusée pendant que les Bridges servent et `--mode=replace-store` une fois arrêtés. Il écrit `ops-qualify.json` (schéma 2 : le profil, le commit, `--candidate-run`, le SHA-256 des quatre archives, chaque étape par son id stable avec sa durée et son premier défaut ; le workflow `qualify`). Un candidat lancé à la main exécute le profil complet et son gate refuse moins (`tools/release/candidate.mjs qualification`) ; celui d’une pull request lance `--short`.

- Lance : `node scripts/ops-qualify.mjs`
- Utilisation : `npm run ops:qualify -- [--tarballs=<dir>] [--image-from=<dir>] [--short] [--candidate-run=<id>] [--old-bridge=<tgz>] [--out=<dir>] [--keep]`

<a name="pack"></a>

#### `npm run pack`

Les archives `quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge` et `quest-n-click-connectors` (4.1.9) qu’une version publie, depuis les fichiers suivis seulement : un fichier non suivi sous une racine publiée refuse l’empaquetage (4.1.8) ; `--publish-dry-run` montre ce que `npm publish` enverrait ([contribute.npm-packages](contribute.npm-packages.md)).

- Lance : `node scripts/pack.mjs`
- Utilisation : `npm run pack [-- --out=<dir> --publish-dry-run]`

<a name="readme-quickstart"></a>

#### `npm run readme-quickstart`

Le démarrage rapide du README tel qu’un lecteur le copie (4.1.19) : le bloc sous « ## Start » lancé tel quel dans un dossier hors du dépôt, son URL d’archive pointée vers l’archive du candidat (`file:`), `npm run dev` jusqu’à ce qu’il réponde, puis `verify` et `build` ; le job `readme-quickstart` du candidat. `--published`, après le tag : l’URL du README répond avec le SHA-256 que liste le SHA256SUMS de la version.

- Lance : `node scripts/readme-quickstart.mjs`
- Utilisation : `npm run readme-quickstart -- --tarballs=<dir> | --published`

<a name="release-check"></a>

#### `npm run release-check`

Ce que lance la CI, d’un coup : doctor `--release`, quality, build, la couverture et son cliquet strict, verify:release, prove:game, `solve --audit-abstractions`, la contre-vérification Rust (`--require-rust`), chaque ensemble de mutation (`--set=all`), les paquets avec `--publish-dry-run`, `audit:deps` et `npm audit --audit-level=high`.

- Lance : `npm run doctor -- --release && npm run quality && npm run build && npm run test:coverage && npx tsx tools/coverage-ratchet.ts --strict && npm run verify:release && npm run prove:game && npm run solve -- --audit-abstractions && npm run reality:xcheck -- --require-rust && npm run test:mutation:core -- --set=all && node scripts/pack.mjs --out=.cache/pack --publish-dry-run && npm run audit:deps && npm audit --audit-level=high`

<a name="release-check-ci"></a>

#### `npm run release-check:ci`

La même chose sans les ensembles de mutation (4.1.10 ; le workflow de publication les lance en jobs à côté), la couverture rapportée pour GitHub Actions et en JSON dans `.cache/test-report/vitest.json`.

- Lance : `npm run doctor -- --release && npm run quality && npm run build && npm run test:coverage -- --reporter=default --reporter=github-actions --reporter=json --outputFile.json=.cache/test-report/vitest.json && npx tsx tools/coverage-ratchet.ts --strict && npm run verify:release && npm run prove:game && npm run solve -- --audit-abstractions && npm run reality:xcheck -- --require-rust && node scripts/pack.mjs --out=.cache/pack --publish-dry-run && npm run audit:deps && npm audit --audit-level=high`

<a name="release-check-local"></a>

#### `npm run release-check:local`

Ce qu’une machine peut lancer de la chaîne de publication : quality, docs:truth, la suite unitaire, build:game, `quality:baseline -- --check --dist`.

- Lance : `npm run quality && npm run docs:truth && npm run test:node && npm run build:game && npm run quality:baseline -- --check --dist`

<a name="ship"></a>

#### `npm run ship`

La chaîne de publication en commandes (4.1.8) : attendre les vérifications d’une pull request (une relance d’un job échoué), la fusionner, attendre la CI de `main` sur la fusion, taguer et pousser, suivre la CI du tag et l’exécution de publication, télécharger la version et vérifier ses sommes et attestations ; `chain <pr> <version>` fait tout. Chaque commande écrit son PID dans `.cache/pids/`. `tag` exige `--candidate=<id d’exécution>` depuis 4.1.17 : une exécution verte du workflow `candidate` (`gh workflow run candidate --ref main -f sha=<sha>` : release-check, la suite lourde trois fois sur des runners neufs, la charge sur SQLite et Postgres, les quatre environnements, un job par ensemble de mutation en gate) dont le manifeste nomme ce SHA ; release.yml publie les fichiers `.wsrun` de cette exécution après vérification de leur SHA-256 (`tools/release/candidate.mjs`). 4.1.20 : `preflight-stable --candidate=<exécution>` dit ce qui manque encore pour la 4.2 stable, vérification par vérification, sans rien changer ; `tag --sign` signe un tag avec une clé SSH ; `verify` lance aussi `gh release verify` ([contribute.releasing](contribute.releasing.md)).

- Lance : `node tools/release/ship.mjs`
- Utilisation : `npm run ship -- <checks|merge|main|tag|watch|verify|chain|preflight-stable> …`

<a name="upgrade-check"></a>

#### `npm run upgrade-check`

Un jeu fait sur une version plus ancienne amené à celle-ci comme le ferait une équipe (4.0) : créé avec l’ancien paquet, vérifié, une sauvegarde faite dedans, puis ce paquet installé, migré, mis à niveau et joué avec cette sauvegarde. La CI le lance.

- Lance : `node scripts/upgrade-check.mjs`
- Utilisation : `npm run upgrade-check -- --from=<version|previous|engine tarball>`

<a name="studio-and-mcp"></a>

### Studio, Studio Server et MCP

La démo statique du Studio, le serveur et l’application de traitement du Studio hébergé, et le serveur MCP pour un assistant IA.

<a name="build-studio-demo"></a>

#### `npm run build:studio-demo`

Le build statique du Studio en mode démo (`STUDIO=1 VITE_STUDIO_DEMO=1 vite build`), avec son instantané du jeu courant ([studio.demo-mode](studio.demo-mode.md)).

- Lance : `tsx tools/select-game.ts && cross-env STUDIO=1 VITE_STUDIO_DEMO=1 vite build`

<a name="mcp"></a>

#### `npm run mcp`

Le serveur MCP du jeu courant sur stdio, pour un assistant IA (`-s` garde la bannière de npm hors de la sortie du protocole) ; avec `--server <url>`, les outils d’un Studio hébergé via son API, avec le jeton de la CLI (`studio-server login --server <url>` d’abord, 4.2.3). [studio.mcp-setup](studio.mcp-setup.md), [studio.mcp-tools](studio.mcp-tools.md).

- Lance : `tsx tools/mcp/server.ts`
- Utilisation : `npm run -s mcp [-- --server <url>]`

<a name="studio-apply"></a>

#### `npm run studio-apply`

Applique au jeu courant un patch téléchargé depuis la démo du Studio (« Download patch ») via le cœur du Studio : les mêmes écritures que le Studio du serveur de dev aurait faites (textes, placements, `storyboard.json`, notes).

- Lance : `tsx studio-server/src/ops/apply.ts`
- Utilisation : `npm run studio-apply <patch.json>`

<a name="studio-client"></a>

#### `npm run studio-client`

La page du Studio que sert le Studio Server (4.2.1) : `studio.html` et son code seuls, construits dans `.cache/studio-client` (`STUDIO_CLIENT=1 VITE_STUDIO_HOSTED=1`).

- Lance : `cross-env STUDIO_CLIENT=1 VITE_STUDIO_HOSTED=1 vite build`

<a name="studio-server"></a>

#### `npm run studio-server`

Le Studio Server, un Studio en ligne pour une équipe (4.2.1 ; [reference.cli](reference.cli.md) liste ses commandes) ; `backup --to-bucket [--keep n]` écrit la sauvegarde dans le bucket de l’instance (4.2.3).

- Lance : `tsx studio-server/src/server/main.ts`
- Utilisation : `npm run studio-server -- <serve|import|export|invite|worker-keys|login|token|deps|backup|restore|replay|gc> …`

<a name="studio-snapshot"></a>

#### `npm run studio-snapshot`

L’instantané de la démo seul : tout ce que le Studio lit du serveur de dev pour le jeu courant, dans un fichier JSON (par défaut `public/studio-demo/snapshot.json`).

- Lance : `tsx tools/studio/snapshot.ts`
- Utilisation : `npm run studio-snapshot [-- <out.json>]`

<a name="studio-worker"></a>

#### `npm run studio-worker`

L’application de traitement du Studio Server, qui ne détient aucun secret de la plateforme (ADR 0028) ; `WORKER_PUBLIC_KEY` et `WORKER_INSTANCE` sont exigées.

- Lance : `tsx studio-server/src/worker/main.ts`

<a name="reality"></a>

### Reality Bridge, connecteurs et speedrun

Le monde hors du jeu (signaux, connecteurs) et les outils de speedrun.

<a name="bridge"></a>

#### `npm run bridge`

La ligne de commande du Reality Bridge pour le jeu courant : `init`, `serve` (`--tenants=a,b`, `--store=`, `--trust-proxy=<liste>`, `--tenant-header`), `grant`, `rotate`, `revoke`, `doctor`, `compact` ; depuis 4.1.10 `migrate --from=jsonl --to=sqlite` et `migrate --schema=N`, `tenant export|delete`, `backup --out=`, `restore --from= --mode=merge|replace-store [--lock-timeout=<ms>]` (4.1.20 : le mode toujours dit, le store tenu seul sous un bail de maintenance). [bridge.cli](bridge.cli.md).

- Lance : `tsx tools/bridge.ts`
- Utilisation : `npm run bridge -- <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> …`

<a name="bridge-load"></a>

#### `npm run bridge:load`

Le Bridge sous charge (4.1.10) : trois processus `serve` sur un store (SQLite, ou Postgres avec `--store` ou `BRIDGE_STORE` ; une valeur vide n’est pas une valeur), le rapport nommant le backend vraiment ouvert et le commit, vérifié par `npx tsx tools/load-report.ts <rapport> --store=<genre>` (4.1.17) ; débit et latence p50/p95/p99, le journal et les flux vérifiés ensuite (sortie 1 sur un signal perdu, doublé ou désordonné). La nuit le lance sur les deux stores.

- Lance : `tsx tools/bridge-load.ts`
- Utilisation : `npm run bridge:load [-- --store=sqlite|postgres://… --instances=3 --players=1000 --proposals=50000 --concurrency=64 --streams=50 --out=<file>]`

<a name="connector"></a>

#### `npm run connector`

Un connecteur du monde extérieur, dans son propre processus, depuis les sources du dépôt (4.1.9) : santé et métriques sur un port local, SIGTERM vide le travail en cours et sort en 0 ; la commande du paquet est `quest-n-click-connector` ([bridge.connectors](bridge.connectors.md)).

- Lance : `node connectors/bin.mjs`
- Utilisation : `npm run connector -- <email|telnet|ssh|open-badge> --config <file.json>`

<a name="fuzz-connectors"></a>

#### `npm run fuzz:connectors`

Les analyseurs des connecteurs sous mutations aléatoires à graine de leur corpus, sans réseau : chaque entrée reçoit une réponse, aucun plantage, RSS avant et après (4.1.9 ; la nuit une minute par connecteur, la CI une demi-minute).

- Lance : `tsx tools/fuzz-connectors.ts`
- Utilisation : `npm run fuzz:connectors [-- --connector=email|telnet|ssh|open-badge|all --cases=10000 --seconds=60 --seed=1 --json]`

<a name="reality-spike"></a>

#### `npm run reality:spike`

Une sonde de la cryptographie du Bridge (4.1.1) : Ed25519 dans WebCrypto (Node, Chromium, WebKit), un JWS compact vérifié sur ses octets exacts, la taille gzip de ce vérificateur, les temps de création, d’atténuation et d’autorisation Biscuit ; un tableau Markdown.

- Lance : `node scripts/reality-spike.mjs`

<a name="reality-xcheck"></a>

#### `npm run reality:xcheck`

La contre-vérification Rust du protocole (4.1.1) : les échantillons officiels de Biscuit passés par l’implémentation JavaScript du Bridge et par la crate Rust (`bridge/xcheck`, quand cargo est là) ; `--require-rust` échoue sans elle, comme la CI et release-check.

- Lance : `tsx tools/reality-xcheck.ts`
- Utilisation : `npm run reality:xcheck [-- --require-rust]`

<a name="runs-load"></a>

#### `npm run runs:load`

Le classement des speedruns à l’échelle (4.1.17) : un store au schéma du Bridge rempli de `--runs` courses vérifiées sur un tableau (et autant sur un autre), le tableau lu `--reads` fois ; latence p50/p95, mémoire résidente et plan SQL (`EXPLAIN QUERY PLAN` / `EXPLAIN`) rapportés avec le backend et le commit ; une borne dépassée sort en 1. Le candidat et la nuit le lancent sur les deux stores (2 000 ms en p95, 512 Mo).

- Lance : `tsx tools/runs-load.ts`
- Utilisation : `npm run runs:load [-- --store=sqlite|postgres://… --runs=100000 --players=5000 --reads=200 --max-p95-ms=<ms> --max-rss-mb=<MB> --out=<file>]`

<a name="speedrun-livesplit"></a>

#### `npm run speedrun:livesplit`

LiveSplit (4.1.14, D23) : `export` écrit un fichier de splits `.lss` depuis une course (sa catégorie, ses splits et ses temps en jeu comme record personnel) ; `serve` est l’autosplitter, qui pilote LiveSplit via son propre serveur WebSocket local à partir des événements que le jeu envoie (`?speedrunTool=7778`).

- Lance : `node tools/speedrun/livesplit.mjs`
- Utilisation : `npm run speedrun:livesplit -- export <run.wsrun> [--names=A,B,…] [--out=<file.lss>] | serve [--port=7778] [--origin=<url>] [--livesplit=ws://127.0.0.1:16834/livesplit]`

<a name="speedrun-overlay"></a>

#### `npm run speedrun:overlay`

Une Browser Source OBS (4.1.14, D23) : http://127.0.0.1:7777/?mode=full, `compact` ou `transparent`, par Server-Sent Events, sur 127.0.0.1 seulement ; le jeu envoie les événements de sa course avec `?speedrunTool=<port>`, rien d’autre, et seulement depuis son origine (le serveur de dev et la prévisualisation par défaut).

- Lance : `node tools/speedrun/overlay.mjs`
- Utilisation : `npm run speedrun:overlay [-- --port=7777 --origin=<url>]`

<a name="speedrun-verify"></a>

#### `npm run speedrun:verify`

Le `.wsrun` d’un speedrun rejoué contre le jeu courant (`GAME=<id>`) : un verdict, son code, sa raison et la confiance qu’il accorde (ADR 0017) ; sortie 0 pour `valid` et `valid-unranked`, 1 sinon (`inconclusive` compris). `quest-n-click speedrun verify` de la CLI et l’outil MCP `speedrun_verify` le lancent. `npx tsx tools/speedrun/reference-run.ts` réenregistre la course de référence commitée (après `npm version` ou un changement de la logique du chapitre de référence).

- Lance : `tsx tools/speedrun/verify.ts`
- Utilisation : `npm run speedrun:verify -- <run.wsrun> [--keys=<file> --json --timeout=<ms>]`

<a name="other-scripts"></a>

### Documentation, changements et CI

Les outils qui gardent la documentation, le CHANGELOG et le plan de la CI fidèles au code.

<a name="changes"></a>

#### `npm run changes`

Les fragments CHANGELOG et LOG d’une branche (`changes/<slug>.md`, `<slug>.log.md`) : `--check` fait échouer une pull request qui change le code sans fragment (le job check de la CI) ; `--assemble` les verse dans CHANGELOG.md et docs/dev/LOG.md dans l’ordre où ils ont atteint main.

- Lance : `tsx tools/changes.ts`
- Utilisation : `npm run changes -- --check [--base=origin/main] | --assemble [--date=YYYY-MM-DD]`

<a name="ci-plan"></a>

#### `npm run ci:plan`

Quels jobs lourds de la CI un changement demande (4.1.9, `tools/ci-plan.ts`) : chaque fichier changé classé par la première règle qui correspond, une ligne de JSON (un booléen par gate : node24, e2e, reference, reality, pwaFirefox, windows, secondGame, freshInstall, upgrade, auditDeps), et depuis 4.5.0 `docs` avec `docsPages`, les pages du wiki dont le changement touche les `sources` ; le workflow, le plan, une configuration commune, le cœur du moteur et un chemin qu’aucune règle ne connaît lancent tout ; en lecture seule.

- Lance : `tsx tools/ci-plan.ts`
- Utilisation : `npm run ci:plan [-- --base=origin/main | --files=a,b | --all]`

<a name="docs-links"></a>

#### `npm run docs:links`

Chaque lien externe de la documentation interrogé une fois (HEAD, puis GET), statuts par domaine, sortie 1 sur un lien ni 2xx ni 3xx ; une personne le lance avant une version, jamais la CI (le réseau n’est pas un test).

- Lance : `node scripts/check-links.mjs`
- Utilisation : `npm run docs:links [-- --timeout=10000]`

<a name="docs-screenshots"></a>

#### `npm run docs:screenshots`

Les images du README tirées du vrai bundle de production et du vrai Studio (Playwright, puis Pillow) : des WebP dans `docs/img/readme/`, 1440 px de large au plus, nommés pour la version qui les a prises ; `--keep-png` garde les captures brutes dans `.cache/docs-shots`.

- Lance : `node scripts/docs-screenshots.mjs`
- Utilisation : `npm run docs:screenshots [-- --only=game|studio --keep-png]`

<a name="docs-truth"></a>

#### `npm run docs:truth`

Ce qu’affirme la documentation, face au code (4.1.16) : les schémas de sauvegarde et de `.wsrun`, chaque script npm et fichier `tools/` ou `scripts/` cité, les capacités dites montées, aucun lien de version plus récent que la version ; sortie 1, chaque contradiction nommée. Le job check de la CI.

- Lance : `tsx tools/docs-truth.ts`

<a name="wiki"></a>

#### `npm run wiki`

La source de la documentation dans `wiki/` (4.5.0, `tools/wiki.ts`) : `check` valide le manifeste (`wiki/manifest.json` : ids, URL `EN-<Domain>-<Topic>` / `FR-<Domaine>-<Sujet>`, états, sources, questions), les pages, leurs liens, sections et parties générées, et n’échoue que sur des erreurs (les liens vers des pages prévues sont listés) ; `stats` compte les pages par état, domaine, type et langue ; `build --target wiki` écrit le dossier publié sur le wiki GitHub (`Home.md`, une barre latérale par langue, le pied de page, les pages `ready` sous leur URL, `--preview` y ajoutant les brouillons sous un bandeau, les quatre index), dans un dossier hors de l’arbre de travail (ou sous `.cache/`) qu’il ne vide que s’il l’a construit ; `env` et `generate` réécrivent depuis le code les pages de référence générées ; les autres commandes empaquettent, archivent et publient ([contribute.writing-docs](contribute.writing-docs.md)).

- Lance : `tsx tools/wiki.ts`
- Utilisation : `npm run wiki -- check | stats [--json] | coverage … | build --target wiki --out <dir> [--preview] | bundle … | archive … | publish … | pages … | env | generate [<page>…] | acceptance …`

<a name="project"></a>

## Scripts d’un projet créé

Écrits par `quest-n-click create` (ou `npm init @quest-n-click`) dans le `package.json` du nouveau projet. À lancer depuis le dossier du projet, après `npm install` : chacun appelle la commande `quest-n-click` du moteur installé.

<a name="project-dev"></a>

#### `npm run dev`

`quest-n-click dev` : le jeu dans le navigateur sur le serveur de dev de Vite, rechargé à chaque modification ; `?edit=<lieu>` ouvre l’éditeur de placement.

- Lance : `quest-n-click dev`

<a name="project-studio"></a>

#### `npm run studio`

`quest-n-click studio` : le Studio (lieux, dialogues, graphe des énigmes, mixage), ouvert sur `/__studio/`.

- Lance : `quest-n-click studio`

<a name="project-assets"></a>

#### `npm run assets`

`quest-n-click assets` : `game/art` et `game/audio` vers `public/assets` (Python 3 avec Pillow).

- Lance : `quest-n-click assets`

<a name="project-verify"></a>

#### `npm run verify`

`quest-n-click verify` : validate, solve, i18n status, lint, playtests : le contenu vérifié, le solveur trouve la fin.

- Lance : `quest-n-click verify`

<a name="project-build"></a>

#### `npm run build`

`quest-n-click build` : assets, verify, le build de production dans `dist/`, chacun de ses fichiers justifié, licences comprises.

- Lance : `quest-n-click build`

<a name="project-release"></a>

#### `npm run release`

`quest-n-click release` : build, puis les gates de publication (validate et weight `--release`, i18n status, voices check `--release`, playtests stricts, la preuve exhaustive, `solve-reality`) ; `--commercial` : aucune exception, aucun provisoire. Les images du modèle sont provisoires : une publication les refuse tant que chaque fichier n’est pas remplacé et relu (`npx quest-n-click provenance --lock`).

- Lance : `quest-n-click release`
- Utilisation : `npm run release [-- --commercial]`

<a name="project-preview"></a>

#### `npm run preview`

`quest-n-click preview` : sert `dist/` sur 127.0.0.1.

- Lance : `quest-n-click preview`

<a name="project-quest-n-click"></a>

#### `npm run quest-n-click`

La commande du moteur elle-même, pour toutes les autres (`doctor`, `validate`, `solve`, `lint`, `migrate`…) : `npm run quest-n-click -- help` les liste ([reference.cli](reference.cli.md#quest-n-click)).

- Lance : `quest-n-click`
- Utilisation : `npm run quest-n-click -- <command> [options]`

<!-- generated:end -->
