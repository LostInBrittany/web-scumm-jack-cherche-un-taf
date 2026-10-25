# Comment fonctionne le moteur

Les pièces du moteur et pourquoi elles sont découpées ainsi : le jeu comme donnée, l'amorçage d'un jeu par une page,
les deux dispositions d'écran, le modèle de scène et ses peintres, la trame de scène et le journal sémantique, la
marche, le graphe des assets, le directeur de musique, et le cache qui permet de jouer hors ligne. L'ordre dans lequel
une action s'exécute est dans [Modèle d'exécution](engine.execution-model.md).

<a name="overview"></a>

## Le moteur

Un moteur de point & click façon SCUMM, pour navigateur, pensé pour le téléphone en paysage. Il ne connaît aucun jeu :
un jeu est un dossier de contenu que le moteur lit.

- **Dans le dépôt du moteur**, les jeux vivent dans `games/<id>/`. Le jeu courant est, dans cet ordre : la variable
  d'environnement `GAME` ; sinon le jeu vers lequel pointe `.cache/game` (posé par `npm run game` ou
  `npm run new-game`) ; sinon `package.json` → `"config": { "game" }` ; sinon `demo`
  ([`tools/game.ts`](../../tools/game.ts)).
- **Dans un projet créé** (la commande `quest-n-click`), les sources du jeu sont dans le dossier `game/` du projet, et
  le moteur est le paquet installé, jamais modifié.

Voir [Organisation d'un projet](create.project-layout.md) et [La boucle de travail](create.working-loop.md).

<a name="a-game-is-data"></a>

## Un jeu est une donnée

Un jeu est un `GameDef` ([`src/engine/core/types.ts`](../../src/engine/core/types.ts), découpé par sujet dans
`src/engine/core/types/`) : lieux, verbes, objets, personnages, règles (`{ verb, a, b, if, do }`), scripts,
écouteurs, dialogues, une carte, une fin. Il ne contient aucune fonction : on peut donc le valider
([`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts), `npm run validate`), le sauvegarder, le
comparer et le résoudre (`npm run solve`). Le code dont un jeu a besoin (une commande personnalisée, un mini-jeu) est
du code de confiance déclaré à côté du contenu et appelé par son nom
([`core/custom.ts`](../../src/engine/core/custom.ts), `src/engine/minigames/`). `compileGame`
([`src/engine/core/define.ts`](../../src/engine/core/define.ts)) fige le contenu et donne un id stable à chaque
règle, choix, sujet, écouteur et étape de script : sauvegardes, sessions et solveur parlent avec ces ids. Voir
[Code personnalisé](create.custom-code.md) et [Formats de fichiers](engine.file-formats.md).

<a name="bootstrap"></a>

## Amorçage

[`src/engine/boot.ts`](../../src/engine/boot.ts)
`bootGame({ game, layouts, manifest, minigames, commands, locales, version, dev, sw })` est ce qu'une page fait pour
lancer un jeu : la langue, les polices, le stockage de sauvegarde vérifié (les premières erreurs sont gardées jusqu'à
ce que l'`App` puisse les montrer), l'`App`, `window.__game`, les outils de dev, le titre, le service worker.
[`src/main.ts`](../../src/main.ts) l'appelle ; un jeu qui embarque le moteur aussi
([Notes de mise à jour v3 : un jeu qui embarque le moteur](install.upgrade-notes-v3.md#embedded-engine)).
`pickLanguage`, `waitFonts` et `openStore` sont exportés pour une page qui a besoin d'un autre ordre. La signature
complète est dans l'[API publique](engine.api.md).

<a name="two-layouts"></a>

## Deux dispositions

- **Téléphone (écran tactile), en paysage** : la scène à gauche ; à droite, une colonne avec les 9 verbes en 3×3, le
  sac sur 3 colonnes et les icônes Carte / Menu / Son. La phrase s'affiche en bas de la scène. La colonne tient dans
  la hauteur de l'écran, zones sûres déduites ([`dom/side-fit.ts`](../../src/engine/dom/side-fit.ts)) : sur un écran
  bas, les cases du sac cessent d'abord d'être carrées, puis les verbes descendent à 44 px, et les icônes restent
  toujours visibles.
- **Ordinateur (une souris, un écran d'au moins 720 × 450)** : la disposition SCUMM classique. La scène occupe le
  haut ; la phrase est juste en dessous ; en bas à gauche, les 9 verbes ; à droite, le sac (4 × 2, flèches à gauche) ;
  tout à droite, les 3 icônes en colonne. Les choix de conversation et la liste des lieux prennent la place des verbes
  et du sac.

Le choix se fait tout seul (`App.layout`, [`dom/shell.ts`](../../src/engine/dom/shell.ts)) : la disposition
ordinateur demande un pointeur fin (`pointer: fine`) et une zone de contenu d'au moins 720 × 450 une fois les zones
sûres retirées. Il se refait à chaque redimensionnement de la fenêtre.

<a name="scene"></a>

## La scène : un modèle et un peintre

[`dom/room.ts`](../../src/engine/dom/room.ts) (`RoomView`) est le modèle de scène d'un lieu : qui est où, quelle image
de quelle pose, la profondeur, la marche, les bouches et les clignements, les fondus, la caméra, et le test de toucher
(la plus petite cible visible sous le doigt). Il donne chaque entité à un peintre sous forme de sprite fini
(`SpriteSpec` dans [`dom/renderer.ts`](../../src/engine/dom/renderer.ts) : image, position des pieds, taille,
profondeur, miroir, rotation, opacité, halo, ombre) et ne lui demande jamais rien en retour : deux peintres ne peuvent
pas diverger sur ce qu'un toucher atteint.

**Le peintre DOM** ([`dom/render-dom.ts`](../../src/engine/dom/render-dom.ts)) est la référence (D10) : une `<img>`
par sprite, le z-index pour la profondeur, une translation CSS pour la caméra. `RoomView.still()` arrête toute
animation sur une image fixe (premières images, bouches fermées, caméra au repos) : `npm run e2e:visual` compare chaque
lieu de la démo, figé, avec sa référence dans `tests/visual/demo/` (bloquant en CI ; `--update` réécrit les références
après un changement voulu). Le peintre DOM dessine les calques, la parallaxe et les occulteurs en polygone (le fond
découpé à la profondeur de l'occulteur).

**Le peintre Canvas 2D** ([`dom/render-canvas.ts`](../../src/engine/dom/render-canvas.ts)) : un `<canvas>` de la
taille de la fenêtre, tenu en place pendant que le lieu dessous suit la caméra, repeint à l'image suivante après un
changement.

- Le fond et les calques de fond immobiles sont rendus une fois sur tout le lieu, puis copiés à chaque image.
- La profondeur est l'ordre de dessin ; un sprite pivote sur ses pieds ; un sprite droit est calé sur les pixels de
  l'écran dans le lieu, comme le fait la mise en page du DOM (la translation de la caméra garde ses fractions, comme
  celle du lieu DOM) ; les sprites hors champ sont sautés ; le fond couvre le lieu comme `object-fit: cover`.
- Il dessine toute la scène (`RoomDef.stage`) : les calques à leur profondeur avec leur parallaxe, leur fusion et leur
  opacité ; les occulteurs (les pixels du fond, ou d'un calque, à travers un polygone, un masque noir et blanc ou
  l'alpha d'un calque, adoucis ou inversés, composés une fois) à la leur ; le premier plan ; les lumières (radiales et
  ambiantes, `screen` ou `multiply`, qui tombent aussi sur le premier plan) ; les particules (une graine par émetteur,
  sur l'horloge de présentation, jamais les dés du moteur) ; les calques d'effet.

Le modèle évalue chaque condition de la scène et la redonne quand l'une change ; la `transition` d'un lieu fond ou
balaie la surface du peintre ; le mouvement réduit (le réglage ou celui du système) coupe la parallaxe, les particules
et les transitions. Un lieu choisit Canvas avec `renderer: 'canvas'` (ou le jeu, pour tous les lieux) ; le paramètre
d'URL `?renderer=canvas|dom` impose un peintre à tous les lieux. L'interface, les dialogues et chaque cible accessible
restent dans le DOM, au-dessus du canvas.

> [!MEASURE id=canvas-parity]
> Les lieux de la démo peints par Canvas à 0,31 % au plus des références DOM ; le jeu entier joué jusqu'à la fin avec
> lui ; 60 images par seconde avec le CPU ralenti 4× (`npm run e2e:perf`), le tout dans la ligne CI `chromium / canvas`.
> - date: 2026-10-05
> - version: 3.4.0
> - volume: la démo (`games/demo`), chaque lieu
> - conditions: Chromium sous Playwright en CI, CPU ralenti 4× pour la cadence d'images
> - source: [docs/en/ENGINE.md au commit qui a ajouté le peintre Canvas](https://github.com/Quest-n-Click/quest-n-click/blob/4610320b931384abb50341a54ff1450176d8fb24/docs/en/ENGINE.md)

<a name="scene-frame"></a>

## La trame de scène, le renderer et le journal

ADR 0011 et décision D21 (4.1.11) : le rendu n'est pas une source d'état. Trois contrats le portent.

**La trame de scène.** [`scene/frame.ts`](../../src/engine/scene/frame.ts) `sceneFrame(state, layouts, anim)` est une
fonction pure qui rend une `SceneFrame` immuable en unités logiques : la caméra ; les calques (le fond, les calques de
scène, les occulteurs, les accessoires) ; les personnages (où ils se tiennent, de quel côté ils regardent, s'ils
parlent ou marchent, leur sprite) ; les cibles avec leurs polygones de clic précalculés (le polygone du layout, sinon
la boîte de ce qui est dessiné, rotation comprise ; la plus petite l'emporte) ; les effets (lumières, particules,
transition) ; et un `hash` de l'ensemble. `RoomView` résout chaque sprite, fait la trame et la peint quand un lieu est
construit ; entre deux constructions, une entité qui change peint son propre sprite (sa part de la trame). Le test de
toucher (`hitTest`) et les boutons accessibles lisent la trame : la couche DOM sémantique (boutons, focus, clavier,
lecteur d'écran) suit ce qui peint le lieu, quel qu'il soit. `tests/dom/scene-frame.test.ts` garde le DOM de chaque
lieu de la démo et du chapitre de référence, dans trois états, identique à ce qu'il était avant la trame.

**Le renderer.** `Renderer` (`mount`, `render(frame)`, `onIntent`, `unmount`) est ce qui dessine une trame. Les
peintres DOM et Canvas sont enveloppés en un seul ([`dom/frame-renderer.ts`](../../src/engine/dom/frame-renderer.ts)) :
une trame inchangée est sautée grâce à son hash, un nouveau lieu est peint en entier, une trame changée par ses
différences. [`scene/null-renderer.ts`](../../src/engine/scene/null-renderer.ts) ne dessine rien, pour les tests et
l'exécution sans écran. La boucle de rendu, la conversion écran ↔ scène et les animations de présentation (cycles de
marche, bouches, particules) sont du côté du renderer ; le moteur ne connaît pas les images. Un peintre n'importe
jamais le moteur (`tests/boundaries.test.ts`).

**Les intentions.** Une `Intent` est la seule chose qui remonte : `act` (un verbe sur une cible, un objet dessus),
`walk` (un point du sol), `pick` (un choix), `skip`, `open` (la carte, le sac, le menu). La couche d'entrée
([`dom/input.ts`](../../src/engine/dom/input.ts)) les fait à partir des touchers, des touches et des clics et les
donne au presenter ([`dom/presenter.ts`](../../src/engine/dom/presenter.ts) `intent()`), qui applique celles du
moteur ([`scene/intent.ts`](../../src/engine/scene/intent.ts)) et répond aux siennes. `App` compose le moteur, le
presenter et le renderer de la vue du lieu. Les mêmes clics sur le peintre DOM et sur le peintre Canvas enregistrent la
même session et le même journal, à des densités de pixels 1, 2 et 3, sur un écran de téléphone et de bureau, avec et
sans mouvement réduit (`tests/dom/intent-equivalence.test.ts`).

> [!GUARANTEE id=same-clicks-same-session]
> Les mêmes clics sur le peintre DOM et sur le peintre Canvas enregistrent la même session et le même journal.

**Le journal sémantique.** `Engine.journal` ([`core/journal.ts`](../../src/engine/core/journal.ts)) numérote ce qui
s'est passé, en identifiants :

| Événement | Quand |
|---|---|
| `sessionStarted` | Une nouvelle partie, un chargement, un checkpoint |
| `roomEntered` | On entre dans un lieu (avec `from` quand on vient d'un autre lieu) |
| `itemAcquired`, `itemLost` | Un objet entre dans le sac ou en sort (un objet passé d'un joueur à l'autre est les deux, chacun avec son `player`) |
| `flagChanged` | La valeur d'un drapeau change (seulement alors ; `null` pour un drapeau retiré) |
| `playerSwitched` | Le joueur prend un autre personnage |
| `objectiveCompleted` | Un objectif devient vrai pour la première fois dans la session (4.1.12, ADR 0014) |
| `endingReached` | `end`, ou la fin scellée |
| `loadMade` | Une sauvegarde est chargée (journalisé avant son `sessionStarted`) |
| `saveMade` | L'autosauvegarde qui suit quelque chose de sémantique |

Les handlers de commandes, l'entrée dans un lieu et le cycle de vie du moteur l'émettent ; rien dans le DOM, et un
genre inconnu est refusé (ce n'est pas le bus de l'interface). `since(seq)` donne les événements après un numéro de
séquence, `subscribe` les entend au fil de l'eau. La fenêtre garde les 10 000 derniers : une session plus longue est
exportée avec `journalTruncated`, et `npm run replay` dit alors qu'il n'a comparé aucun journal. Rejouer une session
donne le même journal (`tests/journal.test.ts` : la démo, le chapitre de référence, 200 jeux générés) ; un fichier de
session le porte, `npm run replay` l'affiche et échoue quand celui du replay diffère, et le panneau de dev liste les
derniers événements.

[`core/objectives.ts`](../../src/engine/core/objectives.ts) vérifie le `done` de chaque objectif à chaque sauvegarde
et juste avant une fin, et émet `objectiveCompleted` la première fois qu'il est vrai, plus jamais dans la session,
après le drapeau qui l'a accompli et avant le `saveMade` de l'autosauvegarde. Un emplacement sur `saveMade` et
`loadMade` attend une sauvegarde qui fasse partie de la session. Voir [Chapitres et objectifs](create.chapters.md).

<a name="walking"></a>

## Marche et mouvements

[`dom/walk.ts`](../../src/engine/dom/walk.ts) fait marcher un personnage sur les zones de marche de son lieu
(`walkZones` : chacune un polygone avec ses trous, sa propre échelle de profondeur et son zoom de caméra) et les liens
entre elles (`walkLinks` : marche, escalier, échelle, saut, téléportation, avec une durée, une animation et une
orientation) : le moins de liens d'abord, puis le plus court chemin dans chaque zone.

- La condition d'un lien est du DSL (`RoomDef.stage.links[id].if`), lue quand la marche est planifiée. Un lien fermé
  arrête la marche à son pied avec sa réplique `locked`, et l'action qui avait demandé la marche s'exécute quand même :
  `npm run lint` avertit (`walk-link-gate`) quand une règle derrière une telle marche ne vérifie pas elle-même la
  condition.
- Le trajet entre zones appartient au cœur depuis 4.1.11 ([`core/motion.ts`](../../src/engine/core/motion.ts)
  `zoneRoute`, pur : en largeur d'abord, un lien à sens unique seulement vers l'avant, un lien fermé nommé comme ce qui
  bloque) ; le marcheur le parcourt.
- `core/motion.ts` donne `launch`, `spring`, `path` et `follow` en formes closes du temps : le même vol à toute
  cadence d'images, rien de simulé, rien de logique dedans. Un personnage reste là où son mouvement s'arrête, comme
  avec `place`.
- L'onglet Rooms du Studio dessine masques, zones et liens sur le fond
  ([`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts)). Le validateur refuse un polygone de masque qui ne
  ferme aucune surface et, dans un lieu à plusieurs zones, une zone qu'aucun lien ne rejoint.

Comment les dessiner : [Géométrie](create.geometry.md) ; quand une chose est visible mais inatteignable :
[Visible mais inatteignable](create.unreachable.md).

<a name="assets"></a>

## Assets : un seul graphe

[`src/engine/core/asset-graph.ts`](../../src/engine/core/asset-graph.ts) dit quels fichiers chaque partie du jeu
demande, d'après le contenu :

- le titre : décor, logo, musique, vidéo, icônes de la colonne, le sac au départ ;
- chaque lieu : décor ; accessoires dans tous leurs états et images d'animation ; chaque personnage qui peut s'y tenir
  (ses acteurs, les personnages jouables qui l'atteignent depuis leur départ par les sorties, la carte ou les
  commandes, ceux qu'on y déplace), avec variantes, bouches et portrait ; sa musique ; ce que ses commandes peuvent
  jouer ou montrer ;
- la carte ; ce que les règles globales peuvent jouer ;
- `offline` : chaque fichier que le jeu livre.

Le renderer précharge la part d'un lieu pour qui s'y trouve vraiment ; le préchargement de fond lit les portées du
lieu courant et des voisins ; le plan hors ligne complet est la portée `offline` ; la provenance la couvre ;
`npm run weight` la budgète. Un fichier que l'un connaît ne peut échapper aux autres. La portée d'un lieu sur-approxime
une visite (toutes les variantes, chaque personnage qui pourrait s'y trouver), jamais l'inverse :
`npm run e2e:weight` échoue sur une requête hors prédiction.

**Polices.** Les polices par défaut passent par le bundler, avec des noms hachés : le précache du service worker les
prend dans le cache HTTP au lieu de les télécharger une seconde fois. La police d'interface, Galmuri11 (depuis 4.3.0),
est une police pixel proportionnelle proche des polices de dialogue LucasArts, livrée en sous-ensemble latin (125 Ko,
[`tools/subset-font.py`](../../tools/subset-font.py)) avec un `size-adjust` qui donne à ses capitales la hauteur de
celles de DotGothic16. DotGothic16, la police par défaut jusqu'à 4.2.5, reste derrière toute famille d'interface
(`fontStack` dans [`dom/fonts.ts`](../../src/engine/dom/fonts.ts)) : son propre sous-ensemble latin (118 Ko) répond aux
quelques symboles absents de Galmuri11, et la police complète (2 Mo, surtout du japonais) est une face dont le
`unicode-range` ne couvre que le reste : un navigateur ne la télécharge, et ne la garde, que pour un caractère hors des
sous-ensembles. Voir [Habillage et polices](create.skin-fonts.md).

<a name="music"></a>

## Musique : un directeur et ses stems

[`dom/director.ts`](../../src/engine/dom/director.ts) joue une partition (`audio.scores`, depuis 3.5) sur Web Audio
depuis des tampons décodés : chaque stem part au même instant de l'horloge audio et boucle sur la même fenêtre, ils
restent donc calés à l'échantillon ; un changement d'état du jeu déplace les gains des stems à la mesure (ou au temps)
suivante, en fondu, programmé à l'avance sur le fil audio. [`core/score.ts`](../../src/engine/core/score.ts) décide
quoi et quand, sans carte son : le mix par état, la grille à travers la boucle, les rampes.

**Stems ou mix unique.** [`dom/audio.ts`](../../src/engine/dom/audio.ts) confie un morceau à partition au directeur là
où il convient : Web Audio, pas de Save-Data, plus de 2 Go de mémoire et 2 cœurs ; sur un navigateur qui ne donne pas
sa mémoire (Safari), seulement si les partitions décodées font 128 Mo au plus (`pcmBytes`). Ailleurs, il joue le mix
unique avec Howler. Le paramètre d'URL `?music=mix|stems` force l'un ou l'autre. Les voix et les morceaux ponctuels
baissent la partition comme le mix.

**Ce que garantit le directeur.**

- Seule la dernière demande joue (3.5.1) : une partition dont les stems finissent de se décoder après qu'une autre a
  été demandée, ou après un arrêt, est abandonnée (`tests/director.test.ts`).
- L'audio décodé qu'il garde est plafonné (3.6, `audio.maxDecodedMB`, 160 par défaut) : au-delà, les partitions jouées
  le moins récemment sont libérées, et une partition plus grosse à elle seule joue son mix unique (d'après son
  `pcmBytes`, avant tout téléchargement). Le plafond compte chaque buffer : un pont qui ne tient pas est abandonné, deux
  partitions qui ne tiennent pas deviennent une coupe, les stingers sont évincés comme les partitions ; un stinger qui
  ne tient pas à côté de la partition est joué en flux, sans être décodé (3.7.1), si bien que le plafond tient après
  chaque opération.
- D'une partition à une autre, `audio.transitions` pose la nouvelle sur le temps, la mesure, la phrase ou le marqueur
  de l'ancienne, après un pont s'il y en a un (3.6, `core/score.ts` `landing`).
- La musique a trois intentions (3.6.1) : `play` (celle de l'histoire, avec ses transitions), `restore` (une
  sauvegarde chargée : ce qui joue s'arrête aussitôt et le morceau sauvegardé repart à son point, même quand c'est
  celui qui joue ; ni transition ni pont tant que la sauvegarde n'est pas en place) et `stop`.
- Le directeur possède ce qu'il programme : une transition pas encore arrivée est un plan (l'ancienne partition, le
  pont, la nouvelle) qu'un arrêt, une restauration ou une nouvelle demande annule, si bien qu'aucun pont ne sonne après
  eux ; l'ancienne partition est arrêtée par une minuterie, jamais par un arrêt programmé d'avance.
- Les voix baissent un bus sous tout ce qu'il joue (ponts et stingers compris), jamais les fondus.
- La phase d'une sauvegarde (`state.music`, écrite par l'application, jamais lue par le moteur) reprend où elle en
  était ; une partition qui se replie sur son mix garde le point sauvegardé.

> [!MEASURE id=music-e2e]
> `npm run e2e:music` rend trente minutes hors ligne avec 0 échantillon de dérive, joue 100 changements de mix sans
> clic (une bascule sèche est détectée), et mesure la gigue en temps réel dans Chromium et WebKit à 0,02 ms, le tout en
> CI. Depuis 3.6, il vérifie aussi les transitions et la phase sauvegardée à l'échantillon.
> - date: 2026-10-05
> - version: 3.5.0
> - volume: trente minutes d'audio rendu, 100 changements de mix
> - conditions: Chromium et WebKit sous Playwright en CI
> - source: [docs/en/ENGINE.md au commit qui a ajouté le directeur](https://github.com/Quest-n-Click/quest-n-click/blob/af2baa85a132266e87e75f0139f764cb6df492ca/docs/en/ENGINE.md)

Comment écrire une partition : [Musique en stems](create.music.md).

<a name="cache"></a>

## Cache et fluidité

**Le service worker** (vite-plugin-pwa / Workbox, configuré dans [`vite.config.ts`](../../vite.config.ts)) garde
l'application de base en cache dès la première visite. Les images, les sons, les vidéos et les polices complètes sont
gardés au premier usage (cache d'abord), puis servis sans réseau ; la musique est servie par morceaux (requêtes
partielles) depuis le cache. Le fichier de la fin scellée (`data/`) est toujours redemandé au réseau d'abord. Une
nouvelle version ne s'active jamais toute seule : le jeu le propose au joueur, après une sauvegarde durable. Ce que
cela implique pour un déploiement (un sous-chemin, une mise à jour qui ne s'affiche pas) est dans [Sous-chemin, cache et service worker](create.deploy-issues.md).

**Le préchargement.** Dès l'écran titre puis après chaque changement de lieu, le moteur réchauffe en tâche de fond le
lieu courant, les lieux directement accessibles et leur audio, par lots dimensionnés par `GameDef.assetBudgets`. Puis,
une fois par page, **le reste du jeu** (`GameDef.offline`, `full` par défaut) : chaque image, bruitage, voix, musique et
vidéo, lot par lot pendant les temps morts, en pause quand la page est cachée. Rien n'est téléchargé en « économie de
données » ou en 2G ; musiques et vidéos attendent mieux que la 3G. `offline: 'nearby'` ne garde que le réchauffement
par lieu.

**Contourner l'ancien cache.** Chaque adresse d'image ou de son porte `?v=<empreinte>` : l'empreinte change dès qu'un
fichier de `public/assets` change, ce qui contourne l'ancien cache.

**Hors ligne, et le dire.** Après la première visite, le jeu entier se joue hors ligne, et le jeu dit si c'est vrai :
le préchargement rend un statut (`App.offlineStatus`, `offlineReady`) :

| Statut | Sens |
|---|---|
| `complete` | Chaque fichier du plan est dans le cache |
| `partial` | Avec sa raison : `network` (et les fichiers en échec), `save-data`, `slow`, `quota` (le navigateur annonce moins de 64 Mo libres avant de commencer) |
| `skipped` | Rien n'a été tenté : `worker` quand le service worker n'a jamais pris le contrôle de la page à temps (télécharger n'aurait rien mis en cache) |
| `off` | `offline: 'nearby'` |

Le menu pause l'affiche (`ui.offlineStatus` : « 312/400 », « jeu entier en cache », « 312/400 ⚠ toucher pour
réessayer ») ; un toucher relance un préchargement partiel, et un fichier déjà dans le Cache API n'est jamais
redemandé : le préchargement reprend d'un rechargement à l'autre sans état propre. `npm run e2e:pwa` exige `complete`,
puis vérifie hors ligne chaque fichier du plan dans le cache et rend un lieu jamais visité (Chromium ; WebKit ne sait
pas naviguer hors ligne sous automatisation et répond « skipped », code 3, accepté seulement par le `--allow-skip` de
la CI).

> [!LIMIT id=nearby-needs-network]
> Avec `offline: 'nearby'`, un lieu jamais visité ni préchargé peut encore demander le réseau.

<a name="why"></a>

## Pourquoi ces choix

- **Rendu DOM plutôt que Phaser** (ADR 0001). Les maquettes validées sont en DOM (images positionnées, texte net, CSS
  pour la mise en page). Une scène d'aventure compte une vingtaine d'images : le DOM suffit largement, et l'interface
  (verbes, sac, menus) reste en CSS. Le cœur ne dépend pas du rendu : un autre peintre peut le remplacer sans toucher
  au contenu, comme l'a fait le peintre Canvas (ADR 0012). Phaser et un moteur physique généraliste restent exclus
  (D10) : ils doubleraient les scènes, l'entrée, la caméra et les assets du moteur, et une collision simulée ne se
  sauvegarde, ne se rejoue ni ne se prouve.
- **Le contenu en données** (ADR 0002) : pas de fonctions dans le contenu, donc validable (`npm run validate`),
  solvable (`npm run solve`) et sauvegardable.
- **Le rendu n'est pas une source d'état** (ADR 0011, D21) : une trame pure, les intentions comme seul chemin de
  retour, un journal en identifiants. Un peintre, un test ou un lecteur d'écran lisent tous la même trame.
- **Bibliothèques** : Howler (audio, déverrouillage iOS), earcut et navmesh (chemins), Tweakpane (outils de dev),
  Vite, Vitest, Playwright.

<a name="trade-offs"></a>

## Compromis

- Le peintre DOM est la référence, mais il ne dessine pas toute la scène (ni lumières, ni particules, ni occulteurs en
  masque) : un lieu qui en a besoin demande Canvas.
- La portée d'assets d'un lieu sur-approxime une visite : un lieu peut précharger des fichiers qu'une visite donnée ne
  montre pas ; l'inverse (une requête hors prédiction) fait échouer `npm run e2e:weight`.
- Les stems demandent de la mémoire : un appareil sous les seuils joue le mix unique, et une partition plus grosse que
  le plafond le fait toujours.
- Le préchargement complet télécharge tout le jeu une fois ; `offline: 'nearby'` l'évite, au prix du réseau pour les
  lieux pas encore visités.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0001, rendu DOM](../../docs/dev/adr/0001-dom-renderer.md)
- [ADR 0002, contenu déclaratif](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0011, trame de scène, intentions, journal](../../docs/dev/adr/0011-scene-frame-intents-journal.md) (D21)
- [ADR 0012, peintre Canvas](../../docs/dev/adr/0012-canvas-backend.md)
- [ADR 0014, objectifs](../../docs/dev/adr/0014-objectives.md)
- [Décisions](../../docs/dev/DECISIONS.md) (D10 : un peintre Canvas à côté de la référence DOM, Phaser exclu)
- Pour écrire un jeu : [Votre premier jeu](create.first-game.md) ; les commandes : [Scripts npm](reference.npm-scripts.md) ;
  les prompts pour des images cohérentes : [Images](create.images.md).
