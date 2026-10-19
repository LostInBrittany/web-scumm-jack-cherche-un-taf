# Feuille de route : de la v1.3 à la lignée 4.1.x, et la 4.2

*Commencée le 3 octobre 2026 à partir d'un audit externe de la v1.2.1 sous le titre « du moteur réactif au moteur de monde (v1.3 → v2.0) » ; chaque release depuis a sa section ci-dessous, la plus récente en dernier. Version anglaise : [docs/en/ROADMAP.md](../en/ROADMAP.md).*

## Contexte

Un audit externe de web-scumm (v1.2.1) conclut que le moteur sait produire un bon point-and-click court, mais pas confortablement un jeu de 30-100 salles, parce qu'il est purement réactif (clic → règle → commandes) et sans simulation de monde. J'ai vérifié ses 18 affirmations contre le code : 12 exactes, 4 partielles, 2 fausses (`give`/`take`/`room` ne sont pas des commandes ; les mini-jeux ne sont pas dans le core, ils sont déjà un registre extensible depuis `games/<id>/index.ts`). Le diagnostic principal tient.

Objectif de l'utilisateur : qu'une personne seule, avec n'importe quelle IA, puisse faire un jeu **complet** (long) avec ce moteur. Ce plan ordonne les évolutions par ce qui bloque réellement un jeu long, pas par fidélité à DOTT.

Ce qui est vrai aujourd'hui (vérifié dans `src/engine/core/types.ts`, `engine.ts`, `src/engine/tools/solve.ts`) :
- un seul `hero`, un seul inventaire ; acteurs stockés par `room.actor`, aucune commande ne déplace un acteur vers une autre salle ;
- aucun script autonome, aucun timer, aucun événement : `onEnter` est le seul déclencheur hors clic ; la seule boucle est le rAF du rendu ;
- 640 × 400 fixe, pas de caméra ; pas d'animation d'accessoire ni d'événement de frame ;
- sujets de conversation `{topic, if, do}` par salle, branchements via `choice`/`if` dans `do` ;
- sorties = hotspots avec `goto` ; `validate` ne construit pas de graphe de salles ;
- une seule sauvegarde (`<id>.save`), version différente ⇒ nouvelle partie, pas de migration ;
- solveur best-first, `--max 20000`, départ possible d'un checkpoint, aucune notion d'objectif ni d'invariant ;
- pas de `custom`, pas de locale, pas de `voice`, réglages = musique/sfx.

## Avis sur l'audit (ce que je garde, ce que je change)

**Je garde** : scheduler + événements + acteurs du monde comme premier jalon ; ne pas réécrire, ne pas passer à Phaser ; solveur par chapitre avec objectifs/invariants ; sauvegardes multi-slots avec migrations data-only ; debugger « pourquoi cette règle est indisponible » ; animations avec événements de frame ; escape hatch avec effets déclarés au solveur.

**Je change** :
- *Événements et scheduler sont une seule feature.* Un bus d'événements sans scripts capables d'attendre (`waitEvent`, `waitUntil`) n'est qu'un flag renommé. Les deux arrivent ensemble, dans le même format de state sérialisable.
- *Multi-protagonistes n'est pas P0* pour « n'importe qui fait un jeu complet » : c'est P0 uniquement pour DOTT. Il passe après la caméra et après les sauvegardes, parce qu'il change la forme du state et doit profiter des migrations.
- *Pas de « dialogue graph » séparé.* Les sujets + `choice` + `do` sont déjà un graphe de données ; un second format dupliquerait le DSL et casserait solveur, MCP et prompts. Ce qu'il manque est la **visualisation** dans le Studio (arbre dérivé des sujets) et le remplissage des trous connus (le Studio ne sait pas ajouter/supprimer un sujet). Le combat d'insultes est une *activité* (mini-jeu), pas une primitive de dialogue.
- *Mini-jeux → plugins* : déjà le cas (`minigames` exporté par le jeu, fusionné dans `App`). Il manque seulement la doc et un exemple hors core ; pas une priorité.
- *Localisation* : retrofit par extraction (textes identifiés par chemin `room.hotspot.look`, fichiers `locales/<lang>.json` qui surchargent) plutôt que par clés dans le contenu, pour ne pas alourdir le DSL que l'IA écrit. Reste P2.
- *Le vrai risque* n'est pas technique : chaque primitive ajoutée doit être comprise par `validate`, `solve`, CONTENT_GUIDE en/fr, le générateur de prompts, les outils MCP et le Studio, sinon l'IA ne l'utilisera pas ou mal. Chaque jalon ci-dessous inclut cette propagation, et la démo utilise chaque primitive au moins une fois.

## Principes de conception (valables pour tous les jalons)

1. **Tout reste données** : nouvelles commandes dans l'union `Cmd`, nouveaux champs typés sur `RoomDef`/`GameDef`, jamais de fonctions dans le contenu (sauf le registre `custom`, qui vit dans `index.ts` comme les mini-jeux).
2. **Tout est dans `GameState`** : compteur de programme des scripts, acteurs du monde, caméra ⇒ sauvegarde et reprise exactes, solveur déterministe.
3. **Le solveur modélise le temps comme un choix** : « laisser le script X finir son itération » est une action du solveur, les `wait` sont nuls en simulation ; les effets d'un `custom` sont déclarés (`effects: Cmd[]`).
4. **Un jalon = un bump de `saveVersion` au plus**, avec migration fournie.
5. **Le jeu privé d'origine suit** : son dépôt embarque une copie de `src/engine` ; à chaque jalon, le moteur est recopié et le jeu rejoué (e2e, 37 tests, solveur). C'est le test de non-régression grandeur nature.

## Jalons

### M1 — « World » (v1.3, livré) : le monde agit sans clic

Fichiers : `src/engine/core/{types,engine,state}.ts`, nouveau `src/engine/core/scheduler.ts`, `src/engine/tools/{validate,solve}.ts`, `src/engine/dom/{app,room}.ts`, `src/engine/dev/panel.ts`.

- **Acteurs du monde** : `GameState.actors` devient `Record<actorId, {room, x, y, pose, facing, visible}>` (clé sans préfixe de salle). `CharacterDef.room?` donne la salle initiale ; une salle liste toujours ses acteurs attendus (`RoomDef.actors`) mais le rendu lit `state.actors[id].room === room`. Commande `{ moveActor: [who, room, entry?] }`. Migration : `room.actor` → `{room: …}`.
- **Événements** : `{ emit: 'bell_rang', payload? }` ; `RoomDef.events` et `GameRules.events`: `Array<{ on: string; if?: Cond; once?: boolean; do: Cmd[] }>`. Un événement n'est pas un état : il déclenche, puis disparaît. `GameState.pendingEvents` pour ceux émis pendant une cutscene.
- **Scheduler** : `RoomDef.scripts` / `GameDef.scripts`: `Array<{ id; while?: Cond; if?: Cond; loop?: boolean; do: Cmd[] }>`. Nouvelles commandes : `{ waitUntil: Cond }`, `{ waitEvent: id }`, `{ startScript: id }`, `{ stopScript: id }`, `{ every: ms, do }` (sucre pour loop + wait). `GameState.scripts: Record<id, {pc: number[], waiting?: …}>` pour reprendre après rechargement. Les scripts tournent entre deux actions du joueur et pendant la marche ; ils se mettent en pause pendant une cutscene et un mini-jeu (règle simple, documentée).
- **Solveur** : ajoute aux actions possibles « avancer le script S jusqu'à son prochain point d'attente / fin d'itération » ; `wait` = 0 ; `waitUntil` bloque tant que la condition est fausse. `validate` : événement émis mais jamais écouté et inversement, script sans effet, `waitEvent` sur un événement jamais émis.
- **Studio / dev** : le panneau `?dev` affiche scripts actifs, acteurs du monde et file d'événements ; bouton « avancer le script ». Studio Check montre les mêmes diagnostics.
- **Démo** : le chat (ou le voisin) patrouille entre jardin et marché ; une cloche du marché émet un événement écouté par la maison.
- **Docs/outils** : CONTENT_GUIDE en/fr section « Le monde vit » ; `tools/prompts.ts` inchangé ; MCP : les outils `room`/`add` acceptent `scripts`/`events` ; AGENTS.md règle « un PNJ qui bouge est un script, pas une règle ».

### M2 — « Scale » (v1.4, livré) : tenir 40 salles sans perdre les testeurs

Fichiers : `src/engine/tools/{validate,solve}.ts`, nouveau `src/engine/tools/graph.ts`, `src/engine/dom/app.ts` (menu), nouveau `src/engine/core/migrate.ts`, `tools/pages/review.ts` ou nouvelle page `world`.

- **Sorties déclarées** : `RoomDef.exits: Record<id, { to: room; entry?: string; if?: Cond; walkTo?: Point; transition?: 'fade'|'cut' }>`. Un exit est rendu comme un hotspot (même layout), le moteur génère la règle `goto`. Les hotspots `goto` existants restent valides.
- **Graphe du monde** : `graph.ts` construit salles/sorties/entrées ; `validate` signale salle inaccessible, entrée inexistante, sortie à sens unique non voulue (sauf `oneWay: true`). Page `npm run page:world` : graphe cliquable (export DOT/SVG), aussi dans le Studio Check.
- **Chapitres et objectifs** : `checkpoints[i].goals?: Cond[]` et `GameDef.invariants?: Cond[]` (« jamais vrai »). `solve` : par défaut, résout checkpoint à checkpoint (chaque segment borné), puis global si demandé ; échoue si un invariant devient vrai sur un chemin atteint. Sortie `--json` enrichie des segments (l'e2e rejoue déjà le chemin).
- **Sauvegardes** : `GameDef.saves?: { slots: number }` (défaut 1 = comportement actuel). Menu pause : sauver/charger dans un slot avec salle, date, durée, miniature (capture `room` déjà possible côté Studio ; côté jeu, une capture CSS→canvas est hors budget : vignette = décor de la salle). Export/import JSON d'un slot. Clé `<id>.save.<n>`, `<id>.save` migré vers le slot 1.
- **Migrations data-only** : `GameDef.migrations?: Array<{ from: number; renameFlag?; renameItem?; renameRoom?; renameActor?; drop? }>`, appliquées en chaîne dans `migrate.ts` avant `ensureProps`. `validate` : les renommages pointent sur des ids existants.
- **Profileur de contenu** : `npm run validate -- --report` : par salle (hotspots sans `look`, verbes en repli, props sans changement), par objet (obtenu où, utilisé combien, consommé), par personnage (sujets, inatteignables, lignes > N). Même rapport dans Studio Check.
- **Démo** : 3 salles → exits déclarés, 2 checkpoints avec goals, 1 invariant, 3 slots.

### M3 — « Picture » (v1.5, livré) : la mise en scène

Fichiers : `src/engine/core/types.ts` (Layout, PropDef, Cmd), `src/engine/dom/room.ts`, `src/engine/dev/editor.ts`, `tools/pages/placement.ts`, `tools/assets.py`.

- **Salles larges et caméra** : `Layout.width?: number` (≥ 640, hauteur reste 400) ; les coordonnées logiques s'étendent ; `assets.py` accepte des décors plus larges que 1280. `GameState.camera: {x, target?}`. Commandes `{ camera: 'follow' | {pan: x, ms} | {to: who} | 'reset' }`. `room.ts` translate le calque scène ; `shake` existe déjà. Éditeur et page de placement affichent la salle entière avec le cadre caméra. Solveur : ignore la caméra.
- **Animations d'accessoires avec événements de frame** : `PropDef.anims?: Record<name, { frames: ImgId[]; fps?; loop?; at?: Record<frameIndex, Cmd[]> }>` ; commandes `{ play: [prop, anim] }`, `{ waitAnim: prop }`. Même `at` sur les poses `anim` des personnages. Le solveur exécute les `at` dans l'ordre, sans attendre.
- **Voix** : `say` accepte `voice?: SoundId` ; `GameDef.audio.voices?` ; auto-avance à la fin du clip ; réglage voix séparé. `refs.ts`/`assets.py` prennent les clips en compte.
- **Préférences** : `GameDef.ui.settings?` active vitesse du texte, taille des sous-titres, réduction des animations/shake, police dys (fournie par le jeu dans `skin.fonts`), volumes musique/sfx/voix. Stockées hors sauvegarde.
- **Démo** : marché élargi (1,5 écran) avec suivi caméra ; porte du garde-manger animée avec `sfx` à la frame 3.

### M4 — « Cast » (v1.6, livré) : plusieurs personnages jouables

Fichiers : `types.ts`, `engine.ts`, `state`, `dom/app.ts` (inventaire, bouton de bascule), `solve.ts`, `validate.ts`, `migrate.ts`.

- `GameDef.hero` reste valide (sucre pour un seul joueur). Nouveau `GameDef.players?: { ids: Id[]; initial: Id; sharedInventory?: boolean }`.
- `GameState.players: Record<Id, { room, inventory, hero: Record<room, Point> }>` + `GameState.active`. Les champs plats `room`/`inventory`/`hero` deviennent des vues sur le joueur actif (accès centralisé dans `state.ts` pour ne pas toucher cent endroits). Migration fournie (saveVersion +1).
- Commandes `{ switchPlayer: id }`, `{ transfer: [item, to] }` ; condition `{ player: id }` ; bouton de bascule dans l'interface, `ui` textes.
- Solveur : la bascule est une action ; le hash inclut tous les joueurs. Validate : objet transférable vers un joueur qui ne peut jamais le recevoir.
- Fixture de test dédié (voir M5) ; la démo n'en a pas besoin, un second exemple `games/trio` (3 salles, 2 joueurs) sert d'illustration et de test e2e.

### M5 — « Open » (v2.0, livré) : ouverture et robustesse

- **Commandes custom** : `games/<id>/index.ts` exporte `commands?: Record<name, { run(ctx, args): Promise<void>; effects?: Cmd[] }>` ; commande `{ custom: name, args }`. Le solveur applique `effects` ; `validate` exige `effects` ou `pure: true`. Doc : « quand le DSL ne suffit pas ».
- **Localisation** : `npm run i18n extract` écrit `games/<id>/locales/<base>.json` (clé = chemin de contenu, valeur = texte) ; `locales/<lang>.json` surcharge au chargement ; `GameDef.lang`/sélecteur. Studio : onglet couverture (manquant, trop long). Le contenu source reste inline : rien ne change pour l'IA qui écrit un jeu.
- **Micro-jeux de test** : `tests/fixtures/{scripts,events,actors,exits,saves,camera,players}/` d'une salle chacun, un test par primitive ; le fixture actuel reste pour le socle.
- **Studio « Play »** : onglet jouant le jeu en iframe `?dev` avec inspecteur d'état (déjà dans le panneau dev) et **explicateur de règle** : clic sur un hotspot/objet → liste des règles candidates avec chaque condition évaluée ✓/✗ (réutilise `evalCond` du core, exposé en mode dev).
- **Mini-jeux** : rien à coder, documenter le registre existant comme `activities` et livrer un exemple dans `games/_template`.

## v2.1 « Proof » (livrée) : prouver le moteur plutôt que l'étendre

Un second audit, sur la 2.0.1, a conclu que les primitives étaient là et que l'étape suivante était la preuve et
l'outillage, pas d'autres commandes. Deux de ses affirmations étaient fausses (`engine.ts` et `types.ts` font moins de
mille lignes chacun, pas trois mille), sa direction était juste. Ce que la v2.1 a livré :

- **Un seul catalogue des commandes** (`src/engine/core/cmds.ts`) : chaque clé de `Cmd`, lesquelles portent des listes
  imbriquées, lesquelles changent l'état, lesquelles portent du texte ; le validateur, le solveur, le parcours des
  textes et les outils de contenu le lisent. Ajouter une variante à `Cmd` sans la lister casse `tsc` ;
  `tests/cmds.test.ts` passe chaque commande dans le validateur et le moteur.
- **Les classiques** (`docs/fr/CLASSICS.md`) : vingt mécaniques célèbres du genre écrites avec le DSL tel quel, chacune
  marquée natif / faisable / custom, cinq jouées et prouvées dans `tests/classics.test.ts`. Les écrire a trouvé trois
  vrais trous du solveur, corrigés : il ne prenait que la dernière option d'un `choice`, il bornait les compteurs qui
  baissent (le marchandage), et il jouait un script d'un bloc au lieu d'un `wait` à la fois (une ronde n'était jamais
  vue dans la salle du milieu).
- **Le graphe de puzzles** (`src/engine/tools/puzzle.ts`) : ce que chaque règle, sujet, script et écouteur exige et
  change ; une fiche par objet, flag, accessoire, lieu ou événement (obtenu par, utilisé par, exige d'abord, débloque,
  en aval) ; dans l'onglet Check du Studio, en page `npm run page:puzzles`, en outil `puzzle_graph`. Le validateur s'en
  sert pour repérer un flag posé seulement par des actions qui l'exigent déjà.
- **Le solveur élague ce qui ne peut pas compter** : depuis le même graphe, un flag que seul son poseur lit, un script
  dont les effets n'atteignent rien de vivant, un promeneur que personne n'attend sortent de l'état. Le jeu généré de
  40 salles est passé de « 20 000 états, tronqué » à 804 états en une seconde (`docs/fr/BENCH.md`).
- **Un jeu de charge généré** (`src/engine/tools/stress.ts`, `npm run bench`) : salles, joueurs, objets, flags,
  promeneurs, scripts, sujets, chapitres et migrations à toute taille, chaque outil chronométré dessus ; un petit tourne
  dans les tests.
- **Les boucles honorent `at`** pour les sons et les secousses ; le validateur y refuse un changement d'état.
- **Les traductions survivent aux refactors** : `extract --lang xx` suit un texte déplacé (même texte source dans le
  fichier de référence précédent), gare ce qui a disparu sous `_stale:`, le ressuscite quand le chemin revient.

## v2.2 « Studio » (livrée) : voir le dialogue, voir l'horloge

- **L'arbre de dialogue** (`src/engine/tools/dialogue.ts`) : les sujets d'un personnage en arbre (sujets, répliques,
  choix et options, branches, chacun avec sa condition), dérivé du DSL, rien à tenir à jour. Dans l'onglet Rooms du
  Studio (un bouton à côté des sujets ; toucher un nœud saute à son éditeur) et en outil `dialogue_tree`.
- **Le journal** (`Engine.trace`, mode dev) : ce que chaque action a répondu, les événements émis et les écouteurs
  atteints, les pas de script, les personnages déplacés, les changements de joueur. Dans l'onglet Play du Studio
  (filtrable par sorte) et le panneau dev (les dix derniers).

## v2.3 « Replay » (livrée) : reproduire, profiler, élaguer

Le troisième audit demandait trois choses dont un jeu long a plus besoin que d'une primitive : reproduire le bug d'un
testeur, savoir pourquoi le solveur est lent ou gros, explorer moins d'ordres équivalents. Les trois viennent du même
fait : le moteur sait ce que chaque action a lu et changé.

- **La session** (`Engine.session`, toujours enregistrée) : chaque entrée depuis le début de la partie ou le chargement
  d'une sauvegarde (actions, voyages sur la carte, changements de joueur, pas de script), avec les réponses données en
  chemin (choix, carte, tirages aléatoires) et ce qui a répondu (les ids du graphe de puzzles). « Exporter la session »
  dans le menu de sauvegarde du jeu, dans le panneau dev et dans l'onglet Play du Studio ; `npm run replay -- fichier.json`
  la rejoue sur le vrai moteur sans affichage et dit où elle cesse de correspondre (`src/engine/tools/replay.ts`). Un
  rapport de bug, c'est un fichier de session et une capture ; le **Replay** de l'onglet Play le parcourt au curseur et
  pose le jeu n'importe où en chemin.
- **La solution du solveur est une session** (`SolveResult.steps`) : `replay()` la prouve, le harnais e2e la joue au
  doigt (plus d'analyse de libellés), et la CI joue le jeu d'exemple dans Chromium à chaque push.
- **Le profil du solveur** (`npm run solve -- --profile`, le « Solver health » de l'onglet Check, l'outil `solve` avec
  `profile: true`) : états, exécutions du moteur, actions sans effet, de quoi les états sont faits (quelle dimension les
  sépare le plus), états par lieu, ce qui a répondu le plus (une carte de chaleur sur le graphe de puzzles), les
  combinaisons use/give qui ne pouvaient que retomber sur le repli, les dimensions indépendantes (un checkpoint entre
  elles couperait les états), les choses monotones. Les actions qu'aucune règle écrite ne peut répondre ne sont plus
  exécutées du tout : trois fois moins d'exécutions du moteur sur le jeu d'exemple.
- **Pourquoi est-ce live ?** (`liveClasses`, `whyLive` dans `src/engine/tools/puzzle.ts`) : chaque nœud du graphe de
  puzzles est *critical* (il mène à la fin, à un objectif ou à un invariant), *world*, *visible* ou *dead* (hors de
  l'état du solveur) ; la fiche montre la chaîne ; « Critical path » estompe le reste du graphe.
- **Réduction d'ordre partiel** (`src/engine/tools/por.ts`, `npm run solve -- --por=sleep|stubborn`) : des actions qui
  touchent des choses différentes commutent. `sleep` saute les ordres déjà couverts (moins d'exécutions, les mêmes
  états) ; `stubborn` n'explore qu'une action commutante à la fois (moins d'états aussi : k ramassages indépendants
  avant une porte font k + 1 états au lieu de 2^k). Désactivée par défaut, la recherche simple reste la preuve ;
  `tests/por.test.ts` vérifie que chaque fixture donne les mêmes réponses dans les trois modes.
- **Commandes custom contrôlées** en mode dev : un `run` qui change l'état hors de ses `effects` déclarés est signalé
  dans le journal.
- Deux trous du hash d'état bouchés (`visited`, les compteurs des blocs `random`) ; les répliques de l'arbre de
  dialogue sautent de nouveau à leur éditeur.

## v2.4 « Author » (livrée) : l'histoire face au jeu, la cinématique face au chrono

- **Couverture du storyboard** (`src/engine/tools/coverage.ts`) : le storyboard (`games/<id>/storyboard.json`)
  confronté au contenu : lieux, locuteurs, personnages des conversations et sons par id ; les actions des cases
  (« Open Grandpa's armchair », « Use pipe with tank », « Talk to Lou: Where is the key? ») analysées avec les verbes du
  jeu et les noms des choses du lieu, puis cherchées dans les règles, les réactions par kind, les sujets et les lignes
  Regarder ; répliques, sujets et indices par leur texte (exact, proche, ou absent). Chaque vérification est *ok*,
  *partial* (les morceaux existent, aucune règle ne répond ; une réplique proche), *missing* ou *unknown* (de la
  prose). Des badges sur les boards et les cases de l'onglet Storyboard du Studio (avec la liste de ce qui manque
  encore), un panneau « Storyboard coverage » dans Check, l'outil `storyboard_coverage` (20 outils).
- **La timeline de cinématique** (`src/engine/tools/timeline.ts`, `src/engine/core/timing.ts`) : combien de temps
  prend une liste de commandes et ce qui se chevauche, lu dans le DSL tel qu'il est écrit : les répliques durent ce que
  le présentateur les affiche, les marches la distance que dit le layout, les animations leurs images, les branches
  `parallel` sur leurs propres pistes, un choix ou un mini-jeu marqué comme le tour du joueur. Un bouton « Timeline »
  à côté de chaque cinématique, script d'arrivée et script du monde dans l'onglet Rooms ; toucher une barre saute à sa
  ligne. Les durées du présentateur viennent maintenant d'un seul fichier.
- L'élagage par dominance (cinquième palier de l'auditeur) n'a pas été fait : sur le jeu d'exemple, le jeu privé et le
  jeu de charge, le profil ne montre aucune dimension où les choses monotones dominent ; cela reste une note dans
  `docs/fr/BENCH.md`.

## v2.5 « Sound » (livrée) : musique et bruitages d'une seule palette

- **La chaîne audio** (`tools/audio`, `npm run audio`, `docs/fr/AUDIO.md`) : un MIDI (ou un fichier audio, transcrit)
  devient un arrangement Sega Mega Drive (FM YM2612 + PSG SN76489 + batterie DAC) écrit dans un `spec.json` que
  l'assistant rédige depuis une analyse automatique (pistes, tessitures, doublures, sections) ; Furnace rend `.fur`,
  `.wav`, `.vgm`, `.mp3` ; un rapport QA mesure chaque canal contre les cibles de la palette, la justesse et la crête.
  Une seule palette (`tools/audio/palette.json`) pour chaque morceau de chaque jeu, comme un seul bloc de style sert
  chaque image.
- **Des bruitages de la même palette** (`games/<id>/audio/sfx.json`, `npm run audio -- sfx`) : de courtes recettes sur
  les canaux FM, PSG et bruit, rendues, coupées et normalisées en `audio/sfx/*.mp3`. Les dix-neuf bruitages du jeu
  d'exemple sont maintenant des rendus Mega Drive au lieu d'échantillons Kenney, et il a un thème : l'ouverture du
  *Lac des cygnes* de Tchaïkovski (domaine public), joué sur l'écran titre et dans chaque lieu.
- Agnostique : le déroulé et les règles vivent dans `docs/fr/AUDIO.md` (`read_doc AUDIO` par MCP), `AGENTS.md` nomme
  la commande et la règle de licence ; le skill Claude ne fait qu'y renvoyer.
- Volontairement non fait : la musique adaptative (transitions à la iMUSE) ; Furnace est téléchargé par `setup`, pas
  embarqué ; la CI ne rend pas l'audio (les fichiers sont commités).

## v3 « Trust » (livrée le 4 octobre 2026) : le moteur auquel confier un jeu long

Co-développée par deux assistants selon `docs/dev/CHARTER.md` ; l'échange est `docs/dev/LOG.md`, les décisions
`docs/dev/DECISIONS.md` (en anglais, dépôt public). La v3 peut casser la v2 (D1) : chaque rupture vient avec sa
migration et un guide de mise à niveau, et le jeu privé de référence est migré sur une branche avant de taguer v3.0.0.
Depuis la v3.0.0, `main` est la branche de release et chaque `v3-<sujet>` y est fusionnée dès qu'elle passe ses
portes (D7).

La proposition d'ouverture est la beta de Codex (`v3-beta1`, journal #1), revue au #2. Ses sujets, chacun une branche
`v3-<sujet>` une fois découpé :

- **saves** : enveloppe de sauvegarde validée, autosave IndexedDB relue après chaque écriture, erreurs de stockage
  visibles, mise à jour PWA qui attend une sauvegarde vérifiée ; références périmées élaguées, pas rejetées.
- **prove** : `solve -- --prove` avec un `status` honnête, softlocks par accessibilité inverse, `random` et choix
  imbriqués explorés ; la preuve reste hors de `npm run build`, ou tourne avec la réduction et un budget.
- **ids** : `schemaVersion: 3` avec des ids stables sur règles, choix, sujets, écouteurs, blocs persistants et pas de
  script ; une seule fonction de nommage partagée par le moteur, le solveur et le graphe de puzzles.
- **studio-security** : loopback par défaut, jeton LAN, écritures same-origin, clé en sessionStorage.
- **ci** : e2e sur le build de production, fumée WebKit (non bloquante jusqu'à trois runs verts), `doctor`, `audit:deps`.
- **offline** : préchargement budgété du lieu et de ses voisins, avec un contrat hors ligne explicite limité aux lieux
  mis en cache plutôt qu'un téléchargement illimité de tout le jeu.
- **upgrading** : `docs/en/UPGRADING.md` + `docs/fr/UPGRADING.md`, la liste v2 → v3, exécutée sur le jeu privé de référence.

## v3.1 « Playtest » (livrée le 4 octobre 2026) : ce que la v3.0.0 a laissé ouvert, puis deux outils qu'un studio attend

Une branche `v3-<sujet>` à la fois, chacune avec son entrée de journal, ses tests, ses docs dans les deux langues et
une passe CI, fusionnée dans `main` au fur et à mesure : `v3-webkit` (le rejeu générique depuis le titre ; WebKit
bloquant après ses trois runs verts), `v3-ids` (`npm run ids`, la démo en schéma 3, chemins de traduction par id),
`v3-boot` (`bootGame` ; le correctif du précache du build à deux entrées), `v3-slots` (emplacements dans IndexedDB),
`v3-offline` (le jeu entier hors ligne après la première visite, D5), `v3-a11y` (une partie entière au clavier),
`v3-lint` (le lint de contenu), `v3-playtests` (sessions depuis les téléphones rejouées en CI, blocages sur la
heatmap), `v3-ci` (la preuve mesurée honnêtement, workflows release et prove, Dependabot), `v3-docs` (ce balayage).
Prochain pas du solveur : la réduction en mode preuve, avec `tests/por.test.ts` pour preuve (BENCH.md).

## v3.1.1 « Truth » (4 octobre 2026) : chaque commande verte dit exactement ce qu'elle prouve

L'audit de la 3.1 par Codex (LOG #24) a trouvé des outils capables d'annoncer un succès sans prouver ce que leur
libellé promet ; le mainteneur a choisi de corriger avant de construire (LOG #25, #26). `v3-qa-truth` : l'e2e exige
une passe du solveur `solved` et le `state.done` du moteur (une fin scellée le pose désormais), l'analyse des playtests
compte depuis la première entrée, le lint sort 2 sur une recherche tronquée et lit chaque action tentée,
`verify:game` lance le lint, `playtests --strict` garde les releases. `v3-offline-truth` : le préchargement rend ce
qu'il a fait, le statut n'est `complete` que si chaque fichier est en cache, le menu pause l'affiche, la fumée PWA
vérifie tout le plan et ne compte jamais le saut de WebKit comme une preuve. `v3-studio-net` : hôtes privés refusés
dans les deux familles d'adresses, aucune redirection, un délai et un plafond sur les appels au fournisseur.
`v3-release-truth` : la release part du succès de la CI du tag, une sauvegarde figée 3.1.0, l'audit complet des
dépendances, D5/D7/D8/D9 consignées. Le jeu de référence privé reste en 3.1.0 (D8).

## v3.2 « Production » (4 octobre 2026) : identité, sauvegardes, preuve, accessibilité et assets sur lesquels une équipe peut compter

La seconde moitié de l'horizon de Codex (LOG #25), une branche à la fois, chacune fusionnée sur CI verte (D9) :
`v32-bindings` (une table des textes anglais du moteur, un e2e en langue de release qui échoue sur tout texte par
défaut visible, liaisons des mini-jeux validées), `v32-line-ids` (un id stable par ligne : traductions et voix le
suivent, `npm run ids -- --lines`), `v32-save-results` (effacer et importer disent ce qu'ils ont fait et ne perdent
jamais la partie, sauvegardes figées 3.0.0 et 3.1.0, une sauvegarde aller-retour dans un vrai navigateur avec et sans
IndexedDB), `v32-proof-scale` (chaque softlock compté et regroupé par cause, la preuve par chapitres depuis chaque
état frontière atteignable, checkpoints vérifiés, un budget ; les réductions mesurées et tenues hors du mode preuve ;
BENCH.md dit où la preuve s'arrête : les jeux à plusieurs personnages), `v32-a11y-gate` (chaque mini-jeu livré se joue
au clavier, axe-core sur quatre écrans, la ligne clavier bloque), `v32-assets-provenance` (`provenance.json` pour
chaque asset livré), `v32-release` (un second jeu fait par `new-game` passe toutes les portes en CI). Hors 3.2, dit
dans BENCH.md et ENGINE.md : prouver un long jeu à plusieurs personnages (la piste solveur 3.3 ci-dessous), un
passage au lecteur d'écran (manuel), l'épinglage DNS des fournisseurs personnalisés.

## v3.3 « Scale » (5 octobre 2026) : prouver les jeux à plusieurs personnages, fermer les contrats de production

D'après une relecture extérieure (LOG #38) et les relectures de la 3.2 par Codex (LOG #39, #40), une branche à la fois,
chacune fusionnée sur CI verte (D9). La preuve : `v33-proof-profile` (où passe le temps, `npm run bench -- --matrix`),
`v33-proof-core` (une frontière en tas et des pointeurs parents : la file passe de 89 % du temps à rien, mêmes
témoins), `v33-player-canonical` (les états qui ne diffèrent que par le personnage actif n'en font qu'un),
`v33-mobility` (régions de mobilité : les déplacements silencieux repliés dans l'action suivante, un repli exact quand
un déplacement ne l'est pas), `v33-chapter-interfaces` (une recherche partagée par chapitre depuis tous les états
frontière, un but vérifié du point de vue de chaque personnage : un vrai défaut trouvé contre la recherche explicite),
`v33-noop-memo` (la réduction d'ordre partiel mesurée en preuve et refusée : elle signalait un softlock inexistant ; à
la place, les écritures du moteur sont tracées et un essai qui n'a rien écrit n'est pas relancé sur les mêmes valeurs
lues, chaque saut vérifiable), `v33-one-status` (un statut, un code de sortie et une phrase pour la ligne de commande,
son JSON, le Studio et l'outil MCP), `v33-proof-cache` (un résultat indexé par le moteur, le jeu et les options, rendu
quand rien n'a changé). La production : `v33-list-ids` (listes de regards, indices, réponses par défaut et réactions
par genre ont des ids stables), `v33-provenance-lock` (un verrou relu de chaque fichier livré et une politique de
licences, exigés pour une release), `v33-asset-weight` (ce qu'un téléphone télécharge avant le premier lieu, par lieu
et par chapitre, tenu à des budgets), `v33-browser-gates` (axe-core sur les dialogues, la carte, les emplacements de
sauvegarde et chaque mini-jeu ; chaque mini-jeu gagné au clavier dans un vrai navigateur ; mises à niveau du stockage
dans Chromium et WebKit).

Critères de sortie, mesurés (BENCH.md « v3.3 ») : le jeu de référence de 40 lieux et 3 personnages (structuré par époques) prouvé en 578
états et 3,5 s (budget 200 000 états, 60 s) ; la démo prouvée en 2,2 s (budget 5 s) et par chapitres en 3,3 s (budget
20 s) ; les abstractions donnent les verdicts de la recherche explicite sur le corpus différentiel
(`tests/reference-proof.test.ts`, `tests/memo.test.ts`, `tests/canonical.test.ts`) ; le profil dit ce que chaque
abstraction a fait ou pourquoi elle est coupée ; un seul statut partout ; CI sur `v33-*`. Pas fait, dit ici : les
workers en parallèle (chaque chapitre est une seule recherche partagée et les chapitres se suivent : il ne reste rien
d'indépendant à répartir, et chaque budget est tenu), la dominance entre états frontière et un backend symbolique
(aucun jeu ne dépasse les budgets), un passage manuel au lecteur d'écran (celui du mainteneur, liste dans
`docs/dev/`), la matrice ouverte à 3 personnages où les objets circulent librement (un vrai produit des placements
d'objets, BENCH.md). Stagecraft (calques, topologie de marche, éditeurs structurés du Studio, production des voix)
passe en 3.4.

## v3.3.1 « Truth » (5 octobre 2026) : ce que la 3.3.0 promettait, rendu exact

D'après la relecture de la 3.3.0 par Codex (LOG #55), une branche à la fois (D9) : `v331-docs-truth` (la réduction
d'ordre partiel marquée historique et refusée en preuve, la mémoire « vérifiée, pas prouvée », la référence
« structurée par époques », aucune revendication WCAG, les fiches de passages manuels), `v331-abstraction-audit`
(`solve --audit-abstractions` sur n'importe quel jeu, 120 jeux aléatoires et un jeu par commande et par condition ; il
a trouvé un défaut de la recherche de base, le masquage des règles absent de l'analyse de vivacité, corrigé),
`v331-commercial` (`verify:commercial` ; les exceptions de release affichées par leur nom), `v331-ci-gates` (WebKit
au clavier et le jeu en français bloquants ; une liste de contrôle Safari hors ligne), `v331-release` (le jeu
construit, un SBOM et une attestation sur la release GitHub ; les notes listent les passages manuels, D12).

## v3.4 « Stagecraft » (5 octobre 2026) : image, scène et Studio

Décidée avec le mainteneur (D10, D11, D13), d'après le plan 3.4 de Codex et son extension, une branche à la fois (D9),
dans l'ordre des dépendances :

- `v34-asset-graph` : un seul graphe des fichiers dont chaque partie du jeu a besoin (titre, lieux, carte,
  hors-ligne), lu par le préchargement, le plan hors-ligne, la provenance et `npm run weight` ; `npm run e2e:weight`
  le vérifie contre les octets qu'un navigateur transfère vraiment (une porte de la CI). Les polices passent par le
  bundler, un sous-ensemble latin.
- `v34-renderer-contract` : le modèle de scène (`RoomView`) et ses peintres ; le peintre DOM est la référence ; des
  références visuelles pour chaque lieu (`npm run e2e:visual`).
- `v34-stage-schema` : `RoomDef.stage` (calques, lumières, émetteurs, transition, conditions des liens) et la géométrie
  de la disposition ; les anciens lieux normalisés, rien à réécrire (UPGRADING §11) ; les sauvegardes 3.x inchangées.
- `v34-canvas` : le peintre Canvas 2D (D10), la surcouche DOM pour l'interface et l'accessibilité ; la parité avec les
  références DOM ; `npm run e2e:perf` (CPU ralenti 4×, une porte de la CI).
- `v34-layers-masks` : parallaxe, occultants (polygone, image de masque, alpha d'un calque, adoucis ou inversés),
  lumières, particules à graine, transitions ; le mouvement réduit respecté.
- `v34-walk-topology` : zones et liens de marche (marche, escalier, échelle, saut, téléportation), une échelle de
  profondeur et un zoom de caméra par zone ; un lien fermé arrête la marche, jamais l'action (lint `walk-link-gate`).
- `v34-stage-physics` : `launch`, `spring`, `path`, `follow`, formes closes du temps, présentation seulement.
- `v34-voice-production` : `npm run voices` (la table par langue, aller-retour CSV, chaque clip vérifié avec ffmpeg),
  la musique baissée sous les voix, des sous-titres pour les sons qui comptent.
- `v34-studio` : l'édition structurée (formulaires pour les réactions, conditions, commandes et scènes, aperçu du
  diff, écritures atomiques validées, annuler / rétablir), la géométrie de la scène dans l'éditeur, l'onglet Voix,
  `set_value` pour les IA.
- `v34-reference` : « Le Marché de nuit » (`games/reference`), le deuxième vrai jeu, la porte de sortie.

Critères de sortie, mesurés (BENCH 3.4) : la première visite dans la prédiction de poids ; les lieux du jeu d'exemple
et de la référence contre leurs références ; le jeu entier joué par le peintre Canvas ; les sauvegardes dorées 3.0 à
3.3 reprises jusqu'au bout ; le marché à 6 calques, parallaxe et 3 masques à 50 i/s avec le CPU ralenti 4× (47 à 8×) ;
un personnage qui traverse deux zones par un escalier et deux plans par une échelle et un saut ; le Studio qui crée
puis annule une scène dans un navigateur ; aucun calque ni lien porteur de logique (lint et test) ; la référence
prouvée en entier et par chapitres, jouée jusqu'au bout au clavier dans Chromium et WebKit, et en français. Signalé,
non fait à la main (D12, `docs/dev/passes/3.4.0.md`) : le lecteur d'écran, des testeurs, un vrai téléphone, Safari
hors ligne, des voix enregistrées, un tag signé. Laissé pour plus tard : les repères de synchronisation labiale dans
la table des voix.

## v3.5 « Score » (5 octobre 2026) : musique, workers, inventaires

D'après le plan décidé avec le mainteneur (D11), une branche à la fois (D9) :

- `v35-music-director` : un morceau peut avoir une partition (`audio.scores`), ses stems rendus depuis l'arrangement
  (`npm run audio -- stems`), joués calés à l'échantillon sur Web Audio ; le mix suit l'état du jeu (un flag, le lieu,
  le personnage actif) à la mesure suivante, en fondu ; des ponctuations sur le temps ; le mix unique là où le
  directeur ne convient pas (Save-Data, un appareil modeste). L'onglet Musique du Studio. `npm run e2e:music` (CI) :
  30 minutes sans un échantillon de dérive, 100 changements sans clic, gigue en temps réel 0,02 ms dans Chromium et
  WebKit.
- `v35-proof-workers` : la frontière développée par lots par des threads, fusionnée dans l'ordre du lot : le même
  résultat pour 1, 2, 4 et 8 workers, ×2,54 avec 4 sur une preuve de 40 000 états. Éteints sauf demande (`--workers`).
- `v35-inventory-ownership` : le propriétaire canonique met en commun les objets qu'aucune condition ne lit tant que
  les personnages peuvent se rejoindre, les remises jouées et vérifiées ; audité contre la recherche explicite. Le
  chapitre de référence 904 → 288 états, la matrice ouverte 20 × 2 prouvée. La dominance pour un témoin en option
  (elle n'élague rien sur les jeux fournis).

Critères de sortie, mesurés (BENCH.md « 3.5 ») : les trois portes du directeur vertes en CI ; les workers identiques
pour 1, 2, 4, 8 et ×2 avec 4 ; le propriétaire jamais en désaccord avec la recherche explicite. **Manqué, non bloquant
(D11) :** la matrice ouverte de 20 lieux × 3 personnages reste tronquée à 200 000 états : le propriétaire ne s'applique
que tant que deux personnages peuvent se rejoindre, et des portes fermées les séparent. Signalé, non fait à la main
(D12, `docs/dev/passes/3.5.0.md`) : le lecteur d'écran, des testeurs, un vrai téléphone, Safari hors ligne, des voix
enregistrées, un tag signé.

## v3.5.1 « Cue » (5 octobre 2026) : les correctifs de la revue

- Le directeur musical ne joue que la dernière demande (une partition lente ne remplace plus celle demandée après
  elle ; un arrêt annule une partition encore en chargement).
- Un navigateur qui ne donne pas sa mémoire n'a les stems que pour des partitions de 128 Mo décodées au plus
  (`pcmBytes`).
- Un worker de preuve qui s'arrête en pleine recherche quitte le pool, et `stats()` a un délai. La table des workers
  donne la RSS maximale : 1,2 Go avec 4 workers.
- Le test de poids ne dépend plus d'un `dist` antérieur.

## v3.6 « Production » (5 octobre 2026) : le reste de la revue de la 3.5.0

- `v36-budgets` : des budgets de poids pour les stems (`backgroundScoreKB`), le préchargement hors ligne complet
  (`offlineTotalKB`) et la plus grosse partition décodée (`decodedAudioMB`), exigés par une release.
- `v36-stem-probe` : `validate --release` mesure les stems avec ffprobe : fréquence, canaux, échantillons exacts, la
  boucle dedans, `pcmBytes` juste.
- `v36-pcm-cache` : le directeur garde au plus `audio.maxDecodedMB` d'audio décodé, le moins récemment joué libéré
  d'abord ; une partition plus grosse joue son mix unique.
- `v36-transitions` : `audio.transitions` (temps, mesure, phrase ou marqueur, un pont, un fondu), mesuré à
  l'échantillon ; une sauvegarde garde la phase de la musique et la charger la reprend là.
- `v36-solver-structure` : le propriétaire canonique met en commun par groupe de personnages qui peuvent se rejoindre ;
  une fuite de minuteurs de 15 Mo par recherche corrigée ; l'audit compare les flags vivants ; `npm run audit:corpus`,
  chaque nuit sur 500 graines.

Critères de sortie, mesurés (BENCH.md « 3.6 ») : chaque nouveau budget fixé et tenu sur les deux jeux ; la sonde des
stems verte sur la démo et rouge sur des fichiers incohérents ; transitions et phase à l'échantillon ; 900 jeux
aléatoires essayés, 549 verdicts comparés à la recherche explicite sans divergence (351 arrêtés partiels, non
comparés). **Encore manqué, non bloquant :** la matrice ouverte à 20 lieux × 3 personnages reste tronquée, désormais à 600 000 états (40 minutes, 7,6 Go) : la mise en commun par groupe prouve 12 et 14 lieux, pas 20. Signalé, pas fait à la main (D12, `docs/dev/passes/3.6.0.md`) : le lecteur
d'écran, des testeurs, un vrai téléphone, Safari hors ligne, des voix enregistrées, un tag signé, une écoute.

## v3.6.1 « Audio truth » (5 octobre 2026) : les correctifs de la revue de la 3.6.0

- `v361-director-lifecycle` : le directeur possède ce qu'il programme. Une transition pas encore arrivée est un plan
  qu'un arrêt, une restauration ou une nouvelle demande annule (aucun pont après eux) ; `restore()` ; un seul bus de
  ducking sous tout ce qu'il joue ; chaque buffer sous le plafond (un pont qui ne tient pas est abandonné, deux
  partitions qui ne tiennent pas coupent, les stingers sont évincés).
- `v361-audio-intents` : `play`, `restore`, `stop`. Charger une sauvegarde restaure sa musique à son point, même quand
  c'est celle qui joue, jamais par une transition ; un repli sur le mix garde le point.
- `v361-budgets-peak` : `transitionPeakMB` (deux partitions, un pont et un stinger décodés à la fois) ; `validate`
  refuse une règle qu'une précédente couvre et un marqueur depuis `'*'` qu'une partition n'a pas.
- `v361-release` : le nightly garde ses comptes (essayés, comparés, partiels, divergents) en artefact ; captures du
  README en 3.6 ; les chiffres du corpus disent « essayés » et « comparés ».

Critères de sortie, mesurés : les 9 cas du cycle de vie échouent sur 3.6.0 et passent ; `npm run e2e:music` charge une
sauvegarde pendant que sa partition continue et revient à moins de 0,1 s du point sauvegardé. Signalé (D12,
`docs/dev/passes/3.6.1.md`) : les mêmes passes humaines, et un tag signé (pas de clé sur cette machine).

## v3.7 « Field Proof » (5 octobre 2026) : ce qui se prouve sans une personne

- `v37-own-theme` : le thème du jeu d'exemple écrit pour le projet (le thème du hautbois du Lac des cygnes, domaine
  public, avec son harmonie et son arrangement propres) : plus aucune exception de release, `verify:commercial` vert
  sur les deux jeux.
- `v37-reference-scores` : la partition propre du marché de référence et deux ponts ; `e2e:music --only=reference` en
  CI (passage de main, restauration avant une arrivée, arrêt pendant l'attente, le pic décodé sous `transitionPeakMB`).
- `v37-corpus-shards` : le corpus de nuit en quatre jobs, additionnés par un cinquième.

Critères de sortie, mesurés : `npm run verify:commercial` vert sur la démo et la référence ; le scénario de référence
vert dans Chromium (pont de 5,47 s, restauration à moins de 0,1 s, pic de 130 Mo pour un budget de 150). Pas fait, la
part humaine de « Field Proof » (D12, `docs/dev/passes/3.7.0.md`) : un passage iPhone/Safari et Android/Chrome,
VoiceOver ou TalkBack, cinq joueurs extérieurs, Safari hors ligne, des voix enregistrées sur un dialogue complet, une
écoute des deux partitions et de leurs ponts, un tag signé.

## v3.7.1 « Artifact Truth » (5 octobre 2026) : la revue de la 3.7.0

- `fix/stinger-cap` : un stinger qui ne tient pas à côté de la partition est joué en flux, jamais décodé au-delà du
  plafond.
- `fix/dist-inventory` : le build ne contient que les fichiers de ce jeu, avec `licenses/` ; `npm run verify:dist`
  justifie chaque fichier.
- `fix/playtest-quotas` : `--strict` honnête sur zéro session ; `verify:field` et ses quotas.
- `fix/workflows` : branches nommées par sorte, releases construites depuis le SHA testé et jamais remplacées, tranches
  du nightly exactes.
- `fix/repo-hygiene` : la ligne de release du README tenue à `package.json` ; plus de bytecode suivi.
- `feature/player-split` (fusionnée tôt) : zod/mini, mini-jeux à la demande, `initialJsKB`, les couches du moteur
  vérifiées.

Critère de sortie, mesuré : `inventaire(dist)` = code + assets verrouillés + données nommées + polices + icônes +
licences, sur la démo (242 fichiers) et la référence (225) ; le nightly en quatre tranches sur 501 graines de chaque
sorte (910 comparées, 0 divergence).

## La route vers la 4.0 (planifiée avec la revue de la 3.7.0, LOG #91)

- **3.8 « Human Proof »** (sortie le 5 octobre 2026), la part machine : le scénario à deux partitions sous WebKit, le kit terrain
  (`docs/fr/FIELD.md`, tapes manquées, `?fps`). Les sept passes humaines restent au mainteneur (D12). Aucune grosse
  primitive moteur.
- **3.9 « Independence »** (sortie le 5 octobre 2026) : le moteur en paquet (`web-scumm`, `create-web-scumm`, la commande `web-scumm`), un jeu
  hors du dépôt fait depuis le modèle empaqueté (Le Phare), `npm run fresh-install` en CI.
- **4.0 « Stable Platform »** (sortie le 5 octobre 2026) : l'API publique en quatre entrées et sa surface tenue par un test, une politique de suivi
  et de dépréciation, la lignée des sauvegardes 3.x chargée en 4.x, le jeu indépendant passé de la 3.9 à la 4.0.
- Laissé à la recherche, pas une porte de la 4.0 : la dominance exacte sur les objets pertinents, la matrice 20 × 3 (un
  critère seulement si un vrai jeu en a besoin).

## v4.0 « Stable Platform » (5 octobre 2026)

- `feature/contracts` (dans la 3.9) : l'API publique en quatre entrées, sa surface et les arguments des outils MCP
  tenus par un test, `docs/fr/API.md`, `docs/fr/SUPPORT.md`.
- `feature/upgrade-proof` : `npm run upgrade-check`, un jeu passé de la release précédente avec sa sauvegarde, en CI.
- Le Phare, passé de la 3.9.0 à la 4.0.0.

Critères de sortie, mesurés : `fresh-install` et `upgrade` verts en CI ; le `release --commercial` du Phare vert en
4.0.0 et sa sauvegarde 3.9.0 jouée jusqu'à la fin ; une sauvegarde par release de la 3.0.0 à la 4.0.0 qui atteint la
fin. Rapporté, pas fait (D12) : les sept passes terrain (`docs/fr/FIELD.md`), un jeu fait par quelqu'un d'autre, la
publication sur npm, un tag signé, le réglage « immutable releases » de GitHub.

## v4.1.0 « Clarity » (livrée le 6 octobre 2026, D14) : plus facile à lire, relire et contribuer

Le plan de Codex `docs/dev/PLAN-4.1.1-CLARITY.md` : aucun changement de gameplay, ni de l'API publique, du contenu ou
des sauvegardes. D'abord une référence de comportement (digests, verdicts du solveur, surface de l'API), puis Biome et
un TypeScript plus strict, les quatre fichiers de plus de 1 000 lignes découpés par responsabilité (moteur, types,
joueur, solveur), des frontières de données typées, couverture et mutation testing, `ARCHITECTURE.md`,
`CODE_TOUR.md`, des ADR et un guide de contribution. Reporté (D12) : la relecture par une personne qui n'a pas
construit le moteur.

Mesuré au tag : les quatre fichiers de plus de 1 000 lignes découpés (`engine.ts` 795, `app.ts` 780, `solve.ts` une
façade sur cinq modules, `types.ts` une façade sur six), sept fichiers de `src/` au-delà de 800 lignes gardés avec leur
raison et plafonnés ; 464 accès indexés vérifiés dans `src/` ; aucun `any` explicite dans `src/` ni `tools/` ; les mêmes
témoins, preuves et sauvegardes de référence que la 4.0.0 sur 15 jeux et 13 sauvegardes ; preuve +1 % ; première
visite 122 → 120 Ko ; planchers de couverture avec toutes les branches des conditions, sauvegardes, migrations et
empreintes ; 340 mutants tués sur 348, les 8 autres expliqués.

## v4.1.1 « Reality Bridge » (livrée le 6 octobre 2026, D14) : un jeu réagit au monde extérieur

Le plan de Codex `docs/dev/PLAN-4.1-REALITY-BRIDGE.md`, sur le code clarifié : un jeu déclare un alphabet fini de
signaux ; un Bridge séparé (appairage, capacités Biscuit, événements signés, journal) les livre au moins une fois ; le
moteur applique chacun au plus une fois, sauvegarde, puis accuse réception ; une session les rejoue hors ligne ; le
solveur prouve un jeu fermé, sous un scénario, ou face aux absences et aux doublons. Un spike tranche d'abord
l'enveloppe, le transport et Biscuit. Un jeu sans `reality` ne paie ni code ni requête. Reporté (D12) : un Bridge
déployé, un vrai webhook.

Mesuré au tag : les choix du spike (un JWS EdDSA compact vérifié par WebCrypto, 381 octets gzippés ; Biscuit côté
Bridge, ses 49 validations officielles et les 22 cas signés et 9 cas de politique du projet au même verdict en
JavaScript et en Rust ; SSE et une lecture par curseur) ; des tests de crash à chaque frontière de la livraison ; le jeu
d'exemple prouvé dans quatre mondes ; le scénario de bout en bout du plan vert sous Chromium et WebKit (réouverture hors
ligne sous Chromium) ; la démo sans un octet de Reality dans sa première visite ni son cache hors ligne.

Le projet reste un moment en 4.1.x ; la 4.2 sera la version finale.

## v4.1.2 « Bridge fiable » (livrée le 6 octobre 2026) : le Bridge rendu vrai

Le mainteneur a demandé une critique sévère de tout le projet et un plan vers une qualité professionnelle, cadrés par
trois décisions : un moteur fiable pour un petit studio, rien de retiré du cœur, la cadence gardée. Une revue
extérieure du Bridge de la 4.1.1 est arrivée avec, vérifiée contre le code : les propositions n'étaient pas atomiques
(une séquence partagée, un signal perdu), le curseur d'une sauvegarde était acquitté pour qui tenait l'appareil, une
rotation bloquait un joueur ; son « signal perdu entre le backlog et l'abonnement » n'existait pas. Six lots, une
branche chacun, chacun avec ses tests : transactions, identité du lien, transport et rotation, surface du Bridge,
preuve du fallback, et falsification (un set de mutation pour ce dont un signal dépend, mesuré à 382 sur 484 et
listé honnêtement ; des propriétés aléatoires ; un paquet compilé installé par la CI ; la garde d'hôte du Studio).
Les releases suivantes du plan, chacune un sujet de qualité à périmètre figé : 4.1.3 les gates (un ruleset sur
`main`, un seul build, les tests lourds du solveur hors du push), 4.1.4 l'honnêteté du moteur (`destroy`, un port
d'erreur, un déterminisme par l'horloge seule, des hooks plutôt que des patchs), 4.1.5 la vraie découpe du cœur,
4.1.6 l'outillage qu'un studio touche, 4.1.7 la documentation, puis la 4.2.0 finale (paquet compilé, npm, une API
hôte).

## v4.1.3 « Gates honnêtes » (livrée le 6 octobre 2026) : la CI rendue fiable

Rien dans le jeu, tout dans ce qui le garde : des workflows qui lisent seulement, annulent, s'arrêtent et épinglent ;
la suite unitaire une fois par push et les tests lourds du solveur chaque nuit (toute l'instabilité de la suite au
push) ; des cliquets de couverture et de baseline qui disent ce qu'ils pourraient tenir ; `release-check` tel que la
CI le lance ; un ruleset sur `main` (les gates requises, pas de force-push, pas de suppression) et des fusions par
pull request ; alertes Dependabot actives, 233 branches fusionnées et 52 worktrees disparus. Les refactorisations
de 4.1.4 et 4.1.5 s'appuient sur ces gates.

## v4.1.4 « Moteur honnête » (livrée le 6 octobre 2026) : ce que fait le moteur quand les choses finissent ou échouent

`destroy` sur le moteur et le joueur (ni boucle, ni écouteur, ni image, ni URL blob laissés), un port d'erreur (un
script qui lève est arrêté et marqué tel dans la sauvegarde), le temps par la seule horloge injectée, des hooks à la
place de méthodes rapiécées, `waitUntil` réveillé par le changement qui le satisfait, les clés de l'état dans un seul
module, des placeholders en anglais avec les noms 4.0 conservés, le code mort retiré et `knip` qui veille aux fichiers
et dépendances morts. La suivante, 4.1.5, rend réelle la découpe de la 4.1.0 : `step()` en table, des sous-objets qui
possèdent leur état, le joueur décomposé, le rendu diffé.

## v4.1.5 « Cœur réel » (livrée le 6 octobre 2026) : la découpe annoncée par la 4.1.0

`step()` en table de handlers (`core/command-handlers.ts`), les boucles de scripts possédées par `ScriptScheduler`,
la session par `SessionLog` (`Engine.sessions`), la caméra et la marche de la vue de pièce par `Camera` et `Walker`
(`view.camera`, `view.walker`) ; les cibles clavier et l'inventaire diffés à chaque changement d'état, la scène
renvoyée au peintre seulement si l'une de ses conditions change, les invités calculés une fois par `targets()` ;
`dom/room.ts` de 1026 lignes à 744, hors de la liste des exceptions ; la table et le scheduler dans le jeu de
mutation du cœur. Comportement identique à chaque étape (la baseline de qualité, les baselines visuelles, la gate de
fréquence d'images). Laissé pour plus tard, dit comme tel : `busyCount`, `guideWait` et `skipping` restent sur
l'Engine ; le joueur (`dom/app.ts`) n'est pas décomposé ; le peintre Canvas construit encore sa liste de dessin à
chaque image. La suivante, 4.1.6, est l'outil du studio : les scripts npm, aucun fichier suivi écrit par `dev` ou
`new-game`, Python hors du chemin de build, Windows, les onglets du Studio, les cibles tactiles du joueur.

## v4.1.6 « Outil de studio » (livrée le 6 octobre 2026) : ce qu'un studio touche tous les jours

Aucun fichier suivi écrit par `dev`, `check`, `build` ou `new-game` (le jeu courant est `.cache/game`, un lien que
`npm run game` pointe ; les chemins `@game` de tsconfig.json regardent là) ; `npm run build` sans Python (les tests
pixel restent dans `npm test` et la CI) ; `npm run doctor` avec des prérequis requis (Node, Chromium) et optionnels
(Python, ses modules, ffmpeg, WebKit), sortie 0 quand seuls des optionnels manquent ; `cross-env` et Node pour les
scripts qui posent une variable ou créent un dossier (Windows) ; `requirements.txt` épinglé ; les plugins Vite dans
`tools/vite/plugins.ts` ; `set_layout` validé et repris comme `set_value` ; la version du serveur MCP lue dans
package.json ; `web-scumm doctor` et `web-scumm mcp` ; des verbes de 44 px sur téléphone, plus de `maximum-scale`,
`prefers-reduced-motion` complet, l'étiquette de la cible au clavier à 12 px ; `packageManager` et `.nvmrc`. Laissé
pour plus tard, dit comme tel : les scripts npm ne sont pas ramenés à douze verbes (81 restent, documentés dans
TOOLS.md) ; les onglets du Studio ne sont pas découpés en vue/état/io et n'ont pas de test par onglet ; l'onglet
Check parle encore la langue du solveur ; `sirv-cli` reste où il est. La suivante, 4.1.7, est la documentation pour
un studio : un README qui donne envie, la référence d'API depuis le TSDoc, un tutoriel « première pièce », la parité
française vérifiée, les fichiers de gouvernance.

## v4.1.7 « Docs pour un studio » (livrée le 6 octobre 2026) : la documentation qu'un studio lit en premier

Les READMEs réécrits dans les deux langues (un pitch, trois commandes, ce que chaque rôle obtient, les captures
reprises, une table de chiffres, la release en un paragraphe, une note de non-affiliation) ; `TUTORIAL.md`, une
première pièce en quinze minutes ; `API.md` avec les signatures de l'API publique générées depuis les sources
(`tools/api-doc.ts`, tenues par un test) ; `SUPPORT.md` avec la politique 4.1.x dite une fois et une matrice de
support ; le `STUDIO.md` français complet, et un test qui tient chaque page française à moins d'un tiers de sa jumelle
anglaise, section par section ; chaque lien relatif vérifié ; chaque script npm documenté dans `TOOLS.md` et testé
tel ; `AGENTS.md` et `CLAUDE.md` sans le travail en binôme de la v3 ; des notes de release sans les numéros du
journal ; un code de conduite, un modèle de pull request, un modèle d'issue de fonctionnalité, le wiki fermé. Laissé
pour plus tard, dit comme tel : la référence d'API porte des signatures et des premières lignes de doc, pas un exemple
par nom ; aucun vérificateur de liens ne va chercher les URL externes. La suite était prévue comme la 4.2.0
« Finale » ; le 7 octobre 2026 le mainteneur l'a remplacée par le programme ci-dessous (D18), et « Finale » en est
devenue la dernière étape, la 4.2.0 « Stable World ».

## v4.1.8 « Foundation Reset » (livrée le 7 octobre 2026) : la fondation modernisée, les gates rendues bloquantes

La première release du programme ci-dessous. La chaîne d'outils : TypeScript 7 natif (les vérifications de types en
une demi-seconde, plus de `baseUrl` ; `web-scumm migrate` réécrit le tsconfig d'un projet plus ancien), Vite 8 sur
Rolldown (le jeu d'exemple construit en une demi-seconde, la première visite à 120 Ko gzippés), vite-plugin-pwa 2,
Node 22.12. Le P0 : un signal remis au jeu et non acquitté était perdu avec sa connexion ; le port garde trois curseurs
et redemande depuis le durable (reproduit en polling par le mainteneur, corrigé avec sa reproduction pour test). La PWA
prouvée dans Chromium, WebKit et Firefox : installation, mise à jour après une sauvegarde durable, mise à jour dont le
chargement échoue, réinstallation ; deux défauts trouvés par ces scénarios corrigés (la mise à jour depuis l'écran
titre, le préchargement avant le contrôle du worker). Le contrôle de release prédit la release (`doctor --release`,
seuls les fichiers suivis dans les paquets, les trois archives installées, le ratchet de couverture strict, la release
vérifiée après publication) ; la gate de mutation à clé d'entrées sur les deux sets, chaque survivant nommé ; Windows
en CI ; `npm run ship` comme chaîne de release. Les trois plus gros fichiers du Studio découpés en modèle, E/S et vues
avec 105 tests ; chaque export public porte `@public` ou `@extension` et une phrase ; les chiffres des README écrits
par la baseline ; un script de liens. Laissé pour plus tard, dit comme tel : les passes humaines de la fiche
(`docs/dev/passes/4.1.8.md`), l'accélération du workflow de release (son propre lot), les 845 lignes de l'onglet
assistant.

## v4.2.2 « Playable Workshop » (livrée en octobre 2026) : le jeu partagé joué, jugé, publié

La deuxième étape 4.2.x (D42) : une prévisualisation construite par l'application de traitement pour chaque révision,
et des sauvegardes qui demandent avant de changer de révision (ADR 0026) ; des diagnostics avec leur révision, la santé
du jeu par révision et la bissection qui nomme la révision qui l'a cassé ; l'annulation personnelle ; des builds
immuables aux manifestes signés ; les assets préparés sur l'application de traitement ; la sauvegarde, la restauration
et le journal envoyé au bucket, avec son RPO. Vite a quitté le serveur. Expérimental jusqu'à ses passes (`studio-hosted`,
`studio-collab`, `studio-preview`, `studio-assets-hosted`). Ensuite : la 4.2.3, la coordination avancée.

## v4.2.1 « Shared Floor » (livrée en octobre 2026) : le Studio en ligne pour une équipe

La première des trois étapes 4.2.x (D39 à D41) : un Studio Server pour un jeu et plusieurs personnes, derrière
OpenID Connect, sur le runtime Node.js natif de Clever Cloud avec PostgreSQL et Cellar. Un journal durable, des pans
tenus par un membre à la fois, un flux en direct de ce qui change, une application de traitement sans secret, le jeu
sur sa propre origine, les écrans du Studio partagé, et une archive de release. Expérimental jusqu'à ce que ses passes
`studio-hosted` et `studio-collab` soient faites. Ensuite : la 4.2.2, l'atelier jouable (prévisualisations par révision, builds,
annulation personnelle ; son plan est #144), puis la 4.2.3.

## v4.2.0 « Stable World » (livrée en octobre 2026) : le SemVer strict, un périmètre stable réduit

Le code de la 4.1.20 avec la version changée, et un correctif du Field Kit (`v4.2.0-rc.2`). Le SemVer strict à partir
d'ici : une mineure ajoute, une majeure retire. Elle sort avant les passes humaines, par décision du mainteneur
(D38) : sont stables le format du contenu et ses outils, la PWA Chromium sur ordinateur et le Bridge sur SQLite ;
toute autre surface est limitée ou expérimentale, comme le dit le GO / NO-GO. Les treize passes se font sur
`v4.2.0`, et une surface est promue dans une 4.2.x
dont le candidat a sa passe (D38). Le tag est signé (D37), la release immuable ; la
publication npm arrive dans une 4.2.x ultérieure.

## v4.1.20 « Last Mile » (livrée en octobre 2026) : le dernier code avant la 4.2

Aucune mécanique nouvelle (`docs/dev/PLAN-4.1.20-LAST-MILE.md`, D34–D37, dix pull requests et la release). Un backup
du Bridge passe au schéma 4 : il dit s'il contient tout le store, quota compris, et son enveloppe est sous son
empreinte (ADR 0023). Une restauration nomme son mode, `merge` ou `replace-store`, et ne tourne qu'avec le store pour
elle seule, sous un lease de maintenance (migration 0005) ; `replace-store` écrit d'abord un backup de sécurité
vérifié. Les deux derniers ensembles de mutation mesurés, `connectors-edge` et `reality-store-postgres`, deviennent
bloquants (473 des 488 survivants tués, 15 nommés), en shards depuis une seule matrice. Chaque candidat qu'un
tag peut nommer joue le profil de qualification complet sur ses propres archives et son image, et trois charges par
store. Une passe humaine est liée aux fichiers de sa surface, et `field:carry` ne la reporte sur un candidat ultérieur
que si aucun n'a changé, version comprise (ADR 0024). Les releases sont d'abord des brouillons, puis immuables ; la
signature, le préflight et le runbook npm de la 4.2 sont répétés sans rien publier. Les passes humaines se font sur le
candidat `4.2.0-rc` qui suit : le GO / NO-GO 4.2 reste NO-GO tant qu'elles ne sont pas faites.

## v4.1.19 « Field Closure » (livrée en octobre 2026) : ce que la seconde lecture de la 4.1.18 laissait ouvert

Aucune mécanique nouvelle (`docs/dev/PLAN-4.1.19-FIELD-CLOSURE.md`, D33, six pull requests et la release ; la fenêtre
DSL n'a rien admis). La sauvegarde du Bridge est un seul instantané et sa restauration tout ou rien (schéma 3, ADR
0021). Le Bridge et les connecteurs sont livrés avec leurs locks ; le candidat construit une fois l'image du Bridge,
avec ses trois identités, et cinq SBOM CycloneDX que la release publie tels quels. Un bundle du Field Kit porte le
manifeste attesté de son candidat et se vérifie à partir du seul bundle. Les ensembles de mutation sont nommés d'après
ce qu'ils mutent (`connectors-pure` ; `connectors-edge` et `reality-store-postgres` mesurés) ; les quatre connecteurs
sont joués depuis leurs archives ; la configuration Vite ne charge plus le Studio. Le profil de qualification couvre
le classement : un worker tué en pleine vérification, un quota partagé, 20 000 runs, un store écrit par la 4.1.17. Le
README est réécrit autour de trois promesses : créer un jeu comme des données, le façonner dans le Studio, le prouver
et le livrer. Les passes humaines démarrent sur le candidat de cette release : le GO / NO-GO 4.2 reste NO-GO tant
qu'elles ne sont pas faites.

## v4.1.18 « Dress Rehearsal » (livrée le 10 octobre 2026) : la répétition générale de la 4.2

La dernière qualification avant la 4.2 « Stable World » (`docs/dev/PLAN-4.1.18-DRESS-REHEARSAL.md`, D32, quatre pull
requests et la release). Aucune mécanique nouvelle. Les passes humaines deviennent des rapports liés au candidat
essayé (le Field Kit : `npm run field:check` et ses voisines), chacune une issue `field-pass` ouverte que le mainteneur ferme une fois
faite. `connectors` et `reality-store` (les parties pures des connecteurs et les stores sur lesquels repose l'adaptateur Postgres, dit exactement depuis la 4.1.19) deviennent des ensembles de mutation bloquants (322 survivants lus ; un bug de
retour arrière SSH trouvé). Le candidat emballe une fois les quatre archives, les installe hors du dépôt sous Ubuntu,
macOS et Windows (un jeu 4.1.17 mis à niveau, le Bridge et un scénario de connecteur depuis leurs archives ; deux bugs
Windows du package trouvés et corrigés) et la release publie ces fichiers mêmes. Le Bridge a un profil de
qualification reproductible (`ops/qualify/` : HTTPS, trois instances, Postgres, deux tenants) qu'un test de fumée tue avec des
propositions en vol, détruit et restaure. Le [GO / NO-GO 4.2](../dev/GO-NO-GO-4.2.md) dit, surface par surface, ce
que la 4.2 peut promettre : NO-GO aujourd'hui, toutes les passes humaines restant à faire.

## v4.1.17 « Stabilization » (livrée le 9 octobre 2026) : la vérité remise au vert avant le tag

La release qui suit le premier nightly de la 4.1.16, rouge après son tag (`docs/dev/PLAN-4.1.17-STABILIZATION.md`,
sept pull requests). Aucune mécanique nouvelle. Un tag repose sur un **run candidat** : `candidate.yml`, lancé à la main
sur un SHA, exécute release-check, la suite lourde du solveur trois fois sur des runners neufs, la charge du Bridge sur
SQLite et sur Postgres, quatre runtimes, le worker dans son conteneur et un job par ensemble de mutation bloquant ;
`candidate-gate` écrit le manifeste de ses fichiers, `ship tag --candidate=` nomme le run, et la release publie ces
fichiers-là après vérification de leurs sommes. La suite lourde est de nouveau verte, chaque rouge expliqué d'abord
(un sujet ajouté au chapitre de référence dans l'oracle, une clé du memo qui valait une position en pixels, un budget de
partition partagé avec huit fichiers). Un classement est trié par le store avant sa limite, un temps plus rapide n'est
plus perdu ; la place et le quota de la file valent pour toutes les instances ; le résultat de la roue est recalculé
depuis ses réponses (ADR 0020) et chaque niveau de confiance dit ce qu'il prouve. Remix, Speedrun et les runs du Bridge
sont bloqués par la mutation, leurs survivants lus un par un. Le joueur a un parcours Mystery ; un run repris garde son
monde et sa preuve ; `bridge serve` modère. Pas fait : la signature des tags (D30, 4.2) et toutes les passes humaines
(D18 : bloquantes pour la 4.2).

## v4.1.16 « Convergence » (livrée le 8 octobre 2026) : les capacités publiées faites pour marcher ensemble

La release qui suit le programme (`docs/dev/PLAN-4.1.16-CONVERGENCE.md`, cinq pull requests, une release candidate
puis le tag final sur le même commit). Aucune mécanique nouvelle : un speedrun porte le monde exact où il s'est joué
(`.wsrun` de schéma 2, D29, ADR 0019), le vérificateur refait ce monde depuis sa graine, le vérifie contre sa catégorie
et les jetons signés du Bridge, rejoue le run dedans et nomme son classement ; le recorder ne change plus une catégorie
Daily ou Mystery en graine aléatoire. Les classements et le défi du jour du Bridge sont durables (SQLite, Postgres),
créés une fois entre instances, réclamés par un seul worker sous bail, montés par `bridge serve`, classés par la clé du
vérificateur avec des rangs partagés. Le résultat d'un minijeu est dans la session, réinjecté au rejeu et lisible par
l'histoire (`minigame.<id>`) ; la roue de code se joue au clavier et à la manette. `e2e:remix-speedrun` enregistre
chaque politique de monde dans quatre runtimes et la vérifie par le vrai worker, à chaque pull request avec
`e2e:canonical`, `e2e:remix` et `e2e:speedrun` (qui a trouvé `canonicalJson` écrivant un autre texte dans Firefox,
corrigé). La lignée des releases est de nouveau une lignée (v4.1.14 fusionnée, un contrôle d'ascendance à chaque tag),
Pages ne se déploie que derrière `pr-gate`, `docs:truth` vérifie les docs contre le code. Pas fait : les ensembles de
mutation `remix` et `speedrun` mesurés, pas bloquants ; le parcours Mystery du joueur ; toutes les passes humaines
(D18 : bloquantes pour la 4.2).

## v4.1.15 « Remix » (livrée le 7 octobre 2026) : un jeu, plusieurs mondes ; la release candidate de la 4.2

La huitième et dernière release du programme, la quatrième avec une release candidate (`v4.1.15-rc.1`, puis `v4.1.15`
sur le même commit), et la release candidate de la 4.2 : le DSL et l'IR sont gelés (D28, `docs/dev/DSL-STABILITY.md`).
Un jeu peut déclarer un manifeste de variation (`remix` : dimensions, domaines, contraintes, ancres taguées) ; `GameIR
+ VariationManifest + seed + algorithmVersion` donnent un `WorldVariant` immuable (ADR 0018), le même sous Node et
dans les navigateurs (testé sous Node ; la vérification multi-runtime dans
les navigateurs est écrite, non lancée), une seed
malformée ou une version inconnue une erreur explicite, jamais un monde par défaut silencieux. Les objets se placent
parmi des ancres que le validateur vérifie (atteignables, pas derrière leur propre objet), les salles de départ et les
rondes des acteurs varient, un indice et sa réponse sont une affectation couplée, l'ordre des énigmes est un graphe de
dépendances (les règles ne sont jamais réordonnées), la présentation tire sur son propre flux et n'écrit jamais un
drapeau (D27) ; `Math.random` est banni du chemin logique par une règle de lint et deux tests. Chaque mode livré est
un catalogue (D25) et `npm run verify:variants`, dans `verify:game`, prouve chaque monde avec un certificat.
L'enveloppe de sauvegarde v4 porte le monde ; une sauvegarde v3 reçoit l'histoire ; une sauvegarde d'un autre monde
est gardée, jamais écrasée sans le choix du joueur. L'écran titre propose Histoire, un nouveau monde, une seed tapée
ou le défi quotidien ; les codes de seed portent un symbole de contrôle ; le Bridge s'engage sur la seed du jour et la
révèle après, vérifiable hors ligne (D26 ; les seeds Mystery peuvent être « magasinées » dans des limites dites par le
modèle de menace). La roue de code est une reconstitution ludique, accessible, imprimable (`npm run code-wheel`) ;
l'onglet Remix du Studio prévisualise, verrouille, compare, mesure le biais ; le chapitre de référence se joue en
Histoire, Remix et quotidien, avec vingt seeds de playtest rejouées. Laissé pour plus tard, dit comme tel :
`e2e:remix` et `e2e:a11y` sur la roue (écrits, non lancés), les cinq seeds humaines, le montage du module quotidien
sur le serveur du Bridge, le champ `variant` de l'enveloppe `.wsrun`, l'enregistrement de la roue dans la session, la
fin `story` de la roue.

## v4.1.14 « Time Attack » (livrée le 7 octobre 2026) : un run, son horloge, sa preuve, son vérificateur

La septième release du programme, la troisième avec une release candidate (`v4.1.14-rc.1`, puis `v4.1.14` sur le même
commit). Une catégorie de speedrun se déclare dans le contenu (`GameDef.speedrun` : chronométrage en RTA, IGT ou IGT
actif, départ et arrivée sur des événements sémantiques, sauvegardes, pauses, indices, rechargements, politique
Reality, composants de l'empreinte qu'un run doit égaler, seed fixe ou aléatoire ; splits ; version des règles),
validée par `npm run validate`, sans changer le moteur ; le chapitre de référence déclare Any%, Any% No Hints et Real
Time. `Engine.runClock` (ADR 0016, D24) lit le RTA (jamais une autorité), les pas logiques et le temps logique en
microticks depuis les durées déclarées ; il observe le moteur et n'écrit jamais l'état. `core/prng.ts` (xoshiro128**,
versionné, un flux par usage, vecteurs de test) sème `engine.random`, une rupture avec sa migration (UPGRADING §26),
comme `SESSION_MAX` 500, la taille d'un morceau de run : un run est un journal chaîné dans IndexedDB qui reprend après
un onglet fermé ou un plantage. Un `.wsrun` chaîne chaque entrée par SHA-256 depuis les règles de la catégorie jusqu'à
une preuve finale ; `npm run speedrun:verify`, la CLI et l'outil MCP le rejouent avec sa seed vers un seul verdict
avec un code (trente altérations chacune refusée) ; les catégories Reality gardent le JWS de chaque signal. Intégrité
n'est pas authenticité : `replay-valid` admet les runs assistés et les reprises après plantage, une seed aléatoire est
le choix du client, seul un témoin ou un modérateur en dit plus (ADR 0017, SPEEDRUN). Records locaux, un fantôme sur
cibles sémantiques, routes `.wsroute`, le panneau speedrun du Studio ; OBS et LiveSplit en outils locaux (D23) ; sur
le Bridge, `runsRoute` (une file, un worker de vérification isolé à tas et temps bornés, sans secret, des refus réseau
en processus qui ne sont pas une isolation, des classements par catégorie et type de seed, modération, rétention, un
run identifié par ses entrées). Un run Any% complet du chapitre de référence est joint à la release et vérifié par
`release.yml`. Laissé pour plus tard, dit comme tel : le niveau témoin serveur, le rejeu à version épinglée,
l'isolation OS du worker, un store SQL des runs et le montage `/v1/runs`, `e2e:speedrun` en CI, les sets de mutation
des nouveaux modules du cœur, de vraies sessions OBS et LiveSplit et les tests de terrain de speedrunners.

## v4.1.13 « Solver Research » (livrée le 7 octobre 2026) : le solveur mesuré, allégé, reprenable ; pas encore à l'échelle

La sixième release du programme, nommée par les deux seuils que `docs/dev/plans/4.1.13-proof-at-scale.md` a fixés
avant tout code : le minimum (un gain mesuré, une représentation compacte, checkpoint et reprise, des verdicts
identiques à la recherche exhaustive sur les petites instances, aucune fausse preuve) est atteint, l'objectif de
release (la matrice dans son budget) ne l'est pas, donc la version ne s'appelle pas « Proof at Scale ».
`docs/dev/PROOF-MATRIX.md` a été figée d'abord : douze jeux générés de 20 à 40 salles et trois personnages, six
contraints et six ouverts, avec budgets et verdicts attendus ; ADR 0015. La recherche range ses états par index avec
des clés internées exactes et ne garde une copie du moteur que le temps qu'un état attende son expansion : pic de tas
÷9 sur les douze instances, ÷16 à ÷20 sur les ouvertes, le temps par état inchangé (les runs du moteur), verdicts et
chemins ceux de la 4.1.8 état pour état (un oracle de 203 recherches, 909 jeux du corpus, 0 divergence).
`--checkpoint`/`--resume`/`--mem` arrêtent et reprennent une preuve au même verdict et au même témoin, même tuée en
pleine expansion (la seconde lecture a trouvé et corrigé une coupe de budget qui perdait des états) ; `--profile`
attribue les états aux positions, inventaires, drapeaux, dialogues et scripts ; `--symmetry` replie les objets jumeaux
(désactivé par défaut, limites dans l'ADR) ; `--workers` partagent la table des états vus avec vol de travail, le
résultat indépendant de leur nombre ; `npm run prove:matrix` tourne la nuit. Huit instances sur douze tiennent dans
leur budget, comme avec la 4.1.8 : le rapport d'écart nomme le levier (un mémo pour les macro-mouvements et les
passages d'objets, qui porte quelle clé). Laissé pour plus tard, dit comme tel : ce mémo, le spike symbolique (non
tenté), la dominance en preuve, les chiffres du runner (ceux de la nuit), les nouveaux modules dans le set de mutation
core.

## v4.1.12 « Language » (livrée le 7 octobre 2026) : le jeu en données, son empreinte, ses objectifs

La cinquième release du programme. `compileIR` transforme un jeu compilé en sa logique sous forme de données (salles,
entités, règles, scripts, objectifs, politiques Reality, les extensions de confiance par nom, un emplacement de
variante réservé à la 4.1.15), déterministe, avec le `fichier:ligne` qui écrit chaque id ; chaque champ d'un jeu,
d'une salle et d'une entité est classé logique, présentation, les deux ou outillage dans une table que le compilateur
vérifie (ADR 0013) ; le runtime continue de lire le jeu compilé, l'IR est une projection. L'empreinte est quatre
SHA-256 calculés avec WebCrypto : `logic`, `trustedExtensions` (le code du jeu, haché par le build dans `site.json`),
`presentation`, `engine` ; une règle changée ne bouge que `logic`, un décor que `presentation`. `canonicalJson` (NFC,
clés triées, pas de `-0`, grands entiers en chaînes décimales, tout ce qui perd refusé) est une fonction unique pour
l'empreinte, le cache de preuves et, dès la 4.1.14, l'enveloppe speedrun, tenue à cinquante valeurs limites sous Node
; `npm run e2e:canonical` les compare dans Chromium, WebKit et Firefox, écrit dans ce lot et pas encore en CI. Les objectifs (ADR 0014) sont la seule primitive
admise : `objectives` dans un jeu, le journal de quêtes du menu pause, `objectiveCompleted` dans le journal sémantique
une fois et jamais plus, `npm run solve -- --goal=100%`, les refus du validateur ; chaque autre candidate du programme
est refusée avec sa preuve dans `docs/dev/DSL-STABILITY.md`. Le Studio génère ses formulaires depuis les schémas et
écrit les objectifs avec un diff prévisualisé et Undo ; MCP gagne `get_ir` ; la référence du DSL (`docs/fr/DSL.md`,
en) est générée depuis les schémas et tenue par un test. D22 : le DSL et l'IR sont stabilisés ici, gelés après Remix.
Laissé pour plus tard, dit comme tel : `e2e:canonical` dans les lignes de la CI, le mode démo du Studio qui écrit des
objectifs, `IrVariantSlot` rempli par la 4.1.15.

## v4.1.11 « Viewport » (livrée le 7 octobre 2026) : le rendu derrière une scène, le journal dans le cœur

La quatrième release du programme, la deuxième avec une release candidate (`v4.1.11-rc.1`, puis `v4.1.11` sur le même
commit). Le journal sémantique appartient au cœur (`Engine.journal`, ADR 0011) : une session commencée, une salle
entrée, un objet acquis ou perdu, un drapeau changé, un personnage choisi, une fin atteinte, un chargement, la
sauvegarde automatique qui suit, numérotés et émis par les gestionnaires de commandes et le cycle de vie du moteur,
jamais par le DOM ; rejouer une session donne le même journal sur le jeu d'exemple, le chapitre de référence et 200
jeux générés, `npm run replay` le compare, un fichier de session le porte (une fenêtre bornée de 10 000 événements,
dite comme telle quand elle est dépassée). La vue de salle produit une `SceneFrame` immuable par une fonction pure
(caméra, couches, personnages, cibles avec leurs polygones de hit, effets, un hash) puis la peint ; chaque salle des
deux jeux livrés, dans trois états, peint le même DOM qu'avant. `App` compose un `Presenter` et un `Renderer` ; un
verbe, une marche, un choix, un saut, un écran ouvert est une `Intent` (D21 : le rendu n'est pas une source d'état),
et les mêmes clics sur le DOM et sur le peintre Canvas enregistrent la même session et le même journal aux ratios de
pixels 1, 2 et 3. Le peintre Canvas survit à un contexte perdu ; la route entre zones de marche est celle du cœur. Le
Studio édite les couches, masques, zones et portails d'une salle sur le décor ; le validateur refuse un masque qui ne
ferme aucune surface et une zone qu'aucun lien ne joint. ADR 0012 : Canvas 2D reste le backend complet, WebGL/Pixi non
mesuré dans ce lot. Laissé pour plus tard, dit comme tel : chaque mesure navigateur de ce lot (`e2e:perf` sur les deux
peintres, budgets CPU et mémoire, un vrai téléphone), le spike WebGL, `objectiveCompleted` (4.1.12).

## v4.1.10 « Constellation » (livrée le 7 octobre 2026) : un Bridge durable, plusieurs instances, plusieurs tenants

La troisième release du programme, la première depuis la 4.1.8 avec une release candidate (`v4.1.10-rc.1`, puis `v4.1.10` sur le
même commit). Le Bridge lit et écrit à travers `RealityStore` (ADR 0009), chaque méthode prenant le tenant en premier,
une seule transaction décidant la déduplication, la séquence, les quotas et la signature : SQLite par `node:sqlite`
pour une machine, Postgres par `pg` pour plusieurs instances (expérimental jusqu'à un déploiement réel), le journal
de la 4.1.9 toujours servi et migré par `npm run bridge -- migrate`. Les instances ne gardent aucun état propre : un
flux sur l'une reçoit ce qu'une autre a accepté, réveillé par `NOTIFY` ou un court sondage ; trois processus dont un
tué pendant 1 000 propositions ne perdent rien (testé). Un serveur sert plusieurs tenants, routés par `Host`, chacun
avec ses clés, sa racine, ses quotas, sa rotation et ses révocations ; un modèle de menace écrit d'abord
(`docs/dev/threat-models/constellation.md`) a demandé un signal qui nomme son contexte, d'où `SignalV2` qui porte
tenant, environnement, origine, lien et clé (ADR 0010 ; le joueur accepte V1 et V2 jusqu'à la 4.1.12, un Bridge
multi-tenant ne signe que V2). Exploitation : `/livez`, `/readyz`, `/healthz`, métriques OpenTelemetry quand l'API
est installée, `tenant export|delete`, `backup`, `restore`, quarantaine des lignes qui ne se vérifient plus, 503 avec
`Retry-After` d'un store occupé, `--trust-proxy` par liste d'autorisation (D20). Mesuré : 1 008 propositions par
seconde sur trois instances SQLite en local (`docs/dev/BENCH-BRIDGE.md`). Laissé pour plus tard, dit comme tel : les
chiffres de charge Postgres (ceux de la nuit), la rétention sur un store SQL, la sécurité par ligne par tenant, une
limite de débit par connecteur partagée entre instances ; le passage humain d'un vrai déploiement multi-instance
derrière HTTPS.

## v4.1.9 « Gateways » (livrée le 7 octobre 2026) : le monde extérieur, par quatre connecteurs

La deuxième release du programme, le même jour que la première. Un paquet `web-scumm-connectors` (la quatrième
archive) avec un SDK (un connecteur reçoit, valide, associe un joueur, porte une clé de déduplication, propose avec
son propre Biscuit atténué ; au moins une fois, appliqué une fois ; la charge utile ne quitte jamais le connecteur, le
Bridge reçoit son empreinte) et quatre connecteurs, chacun avec son modèle de menace écrit avant son code et ses tests
d'abus : email (un webhook HMAC, ou un client IMAP borné ; MIME lu dans un worker sous limites ; HTML inerte ; pièces
jointes refusées), Telnet (un shell virtuel des commandes déclarées par le jeu, limites par adresse et par session),
SSH (`ssh2`, un code de pairing ou une clé déclarée, un terminal et un disque virtuels, rien de l'hôte), Open Badges
(OB2 et OB3 vérifiés, révocation et listes de statut, chaque récupération par un fetcher sûr contre le SSRF). Le build
d'un jeu refuse du code serveur ; `games/signals` joue un chapitre par un email et un terminal, depuis des replays
enregistrés que le solveur prouve. Les quatre sont `experimental` dans SUPPORT jusqu'à ce qu'un vrai fournisseur, un
vrai badge, une exposition contrôlée de SSH et Telnet aient été essayés par des personnes. La cadence elle-même : le
CHANGELOG et le LOG en fragments par branche (`changes/`), la CI en trois niveaux taillée par le changement (`plan`,
`pr-gate`), le job de mutation hors du chemin des pull requests. Laissé pour plus tard, dit comme tel : les réponses
email, DKIM/SPF, IMAP STARTTLS et IDLE ; un plancher de couverture et une gate de mutation pour `connectors/` ; les
passes humaines.

## Le programme 4.1.8 → 4.1.15 (décidé le 7 octobre 2026, D18) : finir les ruptures avant de geler les contrats

Aucun jeu de production ne dépend encore de web-scumm (le jeu du mainteneur reste en 3.1.0, D8) : les sauvegardes, les
projets et l'API publique de la lignée 4.1 sont des oracles de comportement, pas un parc à préserver à tout prix. Le
programme profite de cette fenêtre pour terminer les ruptures d'architecture avant que la 4.2 ne gèle les contrats.
Sa source est `docs/dev/PLAN-4.1.8-4.1.15.md` (en français, les décisions) ; `docs/dev/PROGRAM-4.1.md` le résume en
anglais ; `docs/dev/plans/` tient une fiche d'exécution par release (l'existant, les décisions, les contrats, les
branches dans l'ordre avec leurs tests d'abord, les gates). Règles de chaque version : une fixture ou un test qui expose le besoin avant le code ; une ADR pour tout contrat
transversal ; le cœur déterministe, le contenu déclaratif ; toute primitive atteint le runtime, le validateur, le
solveur, le replay, le Studio, le MCP et la doc ; jamais `proved`, `verified` ni `delivered` quand un budget a été
coupé ; bundle, mémoire, build, preuve et couverture mesurés contre la version précédente ; les archives emballées
testées, pas seulement le checkout ; une fiche de passes humaines par release (D12) ; la version suivante ne s'ouvre
qu'une fois les bloqueurs de la courante fermés.

| Version | Nom de travail | Résultat attendu |
|---|---|---|
| 4.1.8 | **Foundation Reset** (livrée le 7 octobre 2026) | TypeScript 7, Vite 8, PWA 2, le curseur Reality corrigé (le curseur local du port avançait avant l'acquittement : reproduit en polling), des contrôles qui prédisent la release, une release candidate d'abord |
| 4.1.9 | **Gateways** (livrée le 7 octobre 2026) | connecteurs email, SSH, Telnet et Open Badges sur un SDK commun, hors du joueur, expérimentaux jusqu'à un passage réel |
| 4.1.10 | **Constellation** (livrée le 7 octobre 2026) | un Bridge durable, répliqué et isolé par tenant ; le signal peut devenir `SignalV2` si l'analyse de menace le demande |
| 4.1.11 | **Viewport** (livrée le 7 octobre 2026) | un renderer séparé de la logique du jeu, derrière une `SceneFrame` immuable ; un journal sémantique possédé par le cœur |
| 4.1.12 | **Language** (livrée le 7 octobre 2026) | le DSL et une représentation intermédiaire (`GameIR`, une empreinte de jeu) façonnés par Gateways et Viewport ; le socle stabilisé |
| 4.1.13 | **Solver Research** (livrée le 7 octobre 2026 ; « Proof at Scale » non atteint) | une classe documentée de jeux ouverts à trois personnages prouvée dans des budgets publiés, ou nommée « Solver Research » |
| 4.1.14 | **Time Attack** (livrée le 7 octobre 2026) | catégories de speedrun, RTA et temps logique, splits sémantiques, un paquet de preuve vérifiable, ghosts, LiveSplit et OBS en outils locaux |
| 4.1.15 | **Remix** (livrée le 7 octobre 2026) | une variance contrôlée du jeu, déterministe par seed, à solvabilité prouvable ; le DSL gelé après elle |
| 4.1.16 | **Convergence** (livrée le 8 octobre 2026) | les capacités publiées faites pour marcher ensemble : un run lié à son monde, des classements durables, le résultat d'un minijeu dans l'histoire, Remix et Time Attack vérifiés dans quatre runtimes |
| 4.1.17 | **Stabilization** (livrée le 9 octobre 2026) | la vérité remise au vert avant le tag : un tag repose sur un run candidat, classements et admission justes à toute taille et entre instances, le résultat d'un minijeu prouvé, Remix et Speedrun bloqués par la mutation |
| 4.1.18 | **Dress Rehearsal** (livrée le 10 octobre 2026) | la répétition générale de la 4.2 : le Field Kit, tous les ensembles de mutation bloquants, les archives consommées hors du dépôt sur trois systèmes, le profil de qualification du Bridge, le GO / NO-GO 4.2 |
| 4.2.0 | **Stable World** | les contrats gelés, le paquet compilé sur npm, les passes humaines faites, un premier vrai jeu de référence |

L'ordre est voulu : les dépendances et l'intégrité avant les connecteurs ; les connecteurs éprouvent le Bridge avant sa
distribution ; le renderer avant les primitives de mise en scène ; le DSL stabilisé avant de réinvestir le solveur ; le
speedrun réutilise le replay, le solveur et le Bridge une fois stables ; Remix réutilise ses seeds, ses preuves et ses
paquets. Les passes humaines restent rapportées, non bloquantes, pendant la 4.1.x (D12), et deviennent bloquantes pour
la 4.2.0 sur chaque surface annoncée comme supportée.

## Après la 4.0 : où chaque point est allé, et ce qui reste sans plan

- Les passes terrain, puis ce qu'elles trouvent (D12) ; bloquantes pour la 4.2.0 (D18).
- Publier `web-scumm` et `create-web-scumm` sur npm : une 4.2.x après la 4.2.0 « Stable World » (D38) ; Le Phare dans un dépôt public.
- Vite 8 et TypeScript 7 (écartés en 4.0 : le bundler de Vite 8 casse un import par défaut CommonJS, TypeScript 7
  retire `baseUrl` et les `paths` non relatifs) : la 4.1.8 « Foundation Reset », avec le `tsconfig.json` du modèle de projet.
- Les traductions chargées à la demande (la seconde langue pèse ~10 % du JavaScript de la première visite) : un
  changement du contrat du module de jeu, donc une mineure avec une dépréciation, pas un correctif.
- La matrice ouverte à trois personnages : non atteinte en 4.1.13 « Solver Research » (8 instances sur 12 dans leur
  budget) ; le mémo des macro-mouvements et des passages d'objets nommé par le rapport d'écart reste le levier.
- Les repères de synchronisation labiale dans la table des voix (restés de la 3.4).

## Hors plan (décisions explicites)

- Pas de Phaser ni de moteur physique général (D10). Canvas 2D est permis à partir de la 3.4 comme second renderer de
  scène, le DOM restant la référence tant qu'ils ne concordent pas ; WebGL seulement pour un effet que Canvas 2D ne
  tient pas, mesuré.
- Pas de format de dialogue parallèle au DSL.
- Pas de paquet npm avant la 4.2.0 « Stable World » (D18 ; avant elle, aucune seconde personne n'en avait demandé).

## Vérification (à chaque jalon)

1. `npm run validate && npm run solve && npm test && npm run build` verts, CI verte, audit d'assets vert.
2. La démo utilise chaque nouvelle primitive au moins une fois et l'e2e la traverse (capture 844 × 390).
3. Une sauvegarde faite avec la version précédente de la démo se charge après migration (test unitaire sur un JSON figé par jalon).
4. Copie de `src/engine` dans le dépôt privé : 37 tests, solveur 62 actions, e2e le jeu privé d'origine identiques.
5. MCP : `npm run -s mcp` liste les outils mis à jour ; une session d'IA neuve ajoute un script/événement à la démo en suivant seulement CONTENT_GUIDE.
6. Release taguée avec notes de version ; la table « Versions » du README mise à jour.
