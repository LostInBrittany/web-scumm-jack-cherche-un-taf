# Speedrun pour les joueurs : LiveSplit et OBS

Comment jouer un jeu quest'n'click contre la montre, exporter la preuve de votre run, et afficher votre chrono dans OBS
ou piloter LiveSplit. Pour les auteurs qui veulent déclarer des catégories :
[Speedrun pour les auteurs](create.speedrun.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Une tentative chronométrée dans une catégorie que déclare le jeu (Any%, par exemple), découpée en temps
intermédiaires sur ce qui se passe dans le jeu, jamais sur des pixels ; à l’arrivée, un fichier `.wsrun` scellé que
n’importe qui peut rejouer et vérifier ; vos records sur votre appareil ; et, si vous diffusez, un chrono dans OBS ou
LiveSplit piloté par le jeu.

Un rejeu prouve qu’un run est possible et que son temps de jeu est exact. Il ne promet pas de détecter toute triche :
seule l’observation d’un serveur ou d’une personne élève la confiance au-delà (voir [les limites](#limits)).

<a name="context-and-versions"></a>

## Contexte et versions

Le joueur d’un jeu qui déclare des catégories de speedrun (`speedrun` dans son contenu). Le moteur a le speedrun depuis
la 4.1.14 « Time Attack » ; cette page vaut depuis cette version. Le jeu d’exemple sur
[quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/) ne déclare aucune catégorie : son menu de pause
n’a pas de ligne Speedrun ; le jeu de référence du dépôt du moteur (`games/reference`) en déclare plusieurs.

<a name="prerequisites"></a>

## Prérequis

- Un jeu dont le menu de pause affiche **Speedrun**.
- Pour OBS ou LiveSplit seulement : Node 22.12 ou plus récent sur la machine d’où vous diffusez, et une copie du
  moteur (un projet créé, ou le dépôt du moteur) ; [OBS](https://obsproject.com/) ou
  [LiveSplit](https://livesplit.org/).

<a name="where-to-run"></a>

## Où lancer les commandes

Le run lui-même ne demande aucune commande : il se passe dans le jeu. Les outils de diffusion sont de petits processus
Node sur **votre propre machine**, jamais sur un serveur et jamais dans le jeu : dans le dépôt du moteur par `npm run`,
ou dans un projet créé depuis le package du moteur qu’il a installé (`node_modules/@quest-n-click/engine/tools/speedrun/`).

<a name="steps"></a>

## Étapes

<!-- step: start-run -->
1. **Démarrer** : menu de pause › **Speedrun** › une catégorie. Le jeu redémarre avec la graine de la catégorie ; un
   petit chrono montre la catégorie, le temps sur lequel elle est classée (temps réel, temps de jeu, ou temps de jeu
   sans les pauses) et le dernier temps intermédiaire.

<!-- step: during-run -->
2. **Pendant le run** : le menu de pause affiche **Abandonner le run**. Ouvrir le menu est noté comme une pause, et le
   passage de l’onglet en arrière-plan aussi ; ni l’un ni l’autre n’arrête le temps de jeu (le jeu ne tourne pas
   pendant qu’il attend).

<!-- step: export-run -->
3. **À l’arrivée** : le run est scellé, et le menu de pause affiche **Exporter le run** : un fichier `.wsrun`, la
   preuve à envoyer à un classement ou à un ami. Le panneau de développement (`?dev`) a le même export.

<!-- step: records -->
4. **Vos records** restent sur l’appareil, hors ligne (IndexedDB `web-scumm-runs`) : le record personnel et ses temps
   intermédiaires, le meilleur segment de chaque temps intermédiaire, la somme des meilleurs, les tentatives, les
   arrivées, les abandons, des notes. Un run reprend après un plantage ou un onglet fermé depuis son dernier morceau
   enregistré (toutes les 500 entrées) ; ce qui a été joué après est rejoué.

**Le fantôme** est votre record personnel joué à côté de vous, sur des cibles de sens : la salle où il est, l’action
qu’il fait et ce qu’il tient, en avance ou en retard à chaque temps intermédiaire, jamais une trace de pixels. Il est
**désactivé la première fois** que vous jouez une catégorie sur cet appareil, parce qu’il montrerait les solutions des
énigmes.

<a name="streaming"></a>

## Diffusion : OBS et LiveSplit

Les outils tournent sur la machine du joueur (décision D23), jamais sur le Bridge, jamais dans le jeu. Ouvrez le jeu
avec `?speedrunTool=<port>` dans son adresse : la page envoie alors les événements de son run (la catégorie, les
identifiants et noms des temps intermédiaires, les temps ; rien d’autre : ni sauvegarde, ni identifiant de joueur, ni
jeton) à `127.0.0.1:<port>`. Une page porte un seul port : elle alimente un outil à la fois. Les outils n’acceptent les
événements que de l’origine du jeu : par défaut le serveur de développement et la prévisualisation (`localhost` et
`127.0.0.1`, ports 5173 et 4173), `--origin=<url>` pour un jeu déployé. Une autre page ouverte dans le navigateur ne
peut pas envoyer de faux temps.

<!-- step: obs-overlay -->
5. **OBS** : lancez l’incrustation, puis ajoutez dans OBS une **Source navigateur** sur
   `http://127.0.0.1:7777/?mode=full` (ou `compact` : le chrono et le dernier temps ; `transparent` : la même chose
   sans fond). Elle se met à jour par Server-Sent Events.

   ```sh
   # dans le dépôt du moteur, sur votre machine
   npm run speedrun:overlay -- --port=7777 --origin=https://quest-n-click.cleverapps.io
   ```

   ```sh
   # dans un projet créé, sur votre machine
   node node_modules/@quest-n-click/engine/tools/speedrun/overlay.mjs --port=7777 --origin=https://quest-n-click.cleverapps.io
   ```

   Puis ouvrez le jeu à `https://…/?speedrunTool=7777`. Mettez l’adresse de votre jeu dans `--origin`.

<!-- step: livesplit -->
6. **LiveSplit** : dans LiveSplit, Control › **Start WebSocket Server** (il écoute sur
   `ws://127.0.0.1:16834/livesplit`), puis lancez le pont et ouvrez le jeu avec `?speedrunTool=7778`. Le jeu pilote
   LiveSplit : départ, temps de jeu, temps intermédiaire, saut, pause, remise à zéro.

   ```sh
   # dans le dépôt du moteur, sur votre machine
   npm run speedrun:livesplit -- serve --port=7778 --origin=https://quest-n-click.cleverapps.io
   ```

   `--livesplit=ws://…` désigne une autre adresse de LiveSplit.

<!-- step: livesplit-export -->
7. **Des temps LiveSplit depuis un run** : écrire un fichier LiveSplit `.lss` avec les temps intermédiaires d’un run
   comme record personnel.

   ```sh
   # dans le dépôt du moteur, sur votre machine
   npm run speedrun:livesplit -- export run.wsrun --names=Pantry,Garden,Market --out=run.lss
   ```

   Sans `--names`, les segments portent les identifiants des temps intermédiaires ; sans `--out`, le fichier est
   écrit à côté du run.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Dans le jeu : le chrono, puis **Exporter le run** à l’arrivée.
- Dans OBS : la source navigateur affiche le nom de la catégorie au lieu de « waiting for a run… », puis les temps
  intermédiaires à mesure.
- Dans LiveSplit : le chrono démarre avec le run et découpe avec le jeu.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Pas de ligne **Speedrun** dans le menu de pause | Le jeu ne déclare aucune catégorie | Rien à faire : ce jeu n’a pas de speedrun |
| L’incrustation reste sur « waiting for a run… » | La page a été ouverte sans `?speedrunTool=<port>`, ou avec un autre port | Rechargez le jeu avec le port de l’incrustation dans l’adresse |
| L’incrustation ne reçoit rien d’un jeu déployé | L’outil n’accepte par défaut que les origines du serveur de développement | Relancez-le avec `--origin=<l’adresse du jeu>` |
| LiveSplit ne bouge pas | Son serveur WebSocket n’est pas démarré | LiveSplit › Control › Start WebSocket Server |
| Le run ne démarre pas | La catégorie n’a pas pu démarrer (le message dit pourquoi) | Lisez le message ; signalez-le à l’auteur du jeu |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Dans le navigateur : les morceaux du run et vos records dans IndexedDB (`web-scumm-runs`). Sur le disque : le
`.wsrun` que vous exportez, le `.lss` qu’écrit `export`. Les outils ne gardent rien.

<a name="recovery"></a>

## Reprise ou retour arrière

**Abandonner le run** termine une tentative (comptée comme abandon). Un run repris après un plantage continue depuis
son dernier morceau ; un run ne peut pas être repris dans un autre monde ni avec une autre preuve. Un run envoyé à un
classement sur un Bridge se supprime avec le jeton donné par le Bridge à l’envoi
([Confidentialité](play.privacy.md#runs)).

<a name="limits"></a>

## Limites

> [!LIMIT id=integrity-not-authenticity]
> La chaîne prouve qu’un fichier n’a pas été modifié après son scellement, pas que le joueur était honnête : pauses,
> menus, sauvegardes, temps réel et entrées utilisées sont la parole du joueur. Un run dont un script a choisi les
> entrées se rejoue comme valide ; seul un témoin ou un modérateur l’écarte.

> [!LIMIT id=livesplit-obs-not-tried]
> OBS et LiveSplit ne sont testés que par des machines. Une vraie session par une personne, c’est la passe
> `livesplit-obs`, ouverte ([#81](https://github.com/Quest-n-Click/quest-n-click/issues/81)) à la 4.4.0.

<a name="references"></a>

## Références

- [Speedrun pour les auteurs](create.speedrun.md) : catégories, chronométrage, vérification, classements, niveaux de
  confiance.
- [Accessibilité](play.accessibility.md#fairness) : les options qui ne comptent jamais comme triche.
- Conception : [ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md) (l’horloge, le générateur à graine, la
  preuve chaînée), [ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md) (verdicts et confiance).
- Le code : [`tools/speedrun/overlay.mjs`](../../tools/speedrun/overlay.mjs),
  [`tools/speedrun/livesplit.mjs`](../../tools/speedrun/livesplit.mjs),
  [`tools/speedrun/local.mjs`](../../tools/speedrun/local.mjs).
