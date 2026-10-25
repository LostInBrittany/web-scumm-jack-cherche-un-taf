# Paramètres d'URL de développement

Les paramètres de requête que lit la page d’un jeu. Ajoutez-les à l’URL de la page dans le navigateur : sur le serveur
de dev (`npm run dev` depuis la racine du dépôt du moteur, ou depuis le dossier d’un projet créé), l’adresse est
`http://localhost:5173/` sauf si Vite en annonce une autre. Certains sont des outils de développement, lus seulement
par une page de développement ; les autres marchent dans tous les builds, celui de production compris.

<a name="where"></a>

## Les builds qui les lisent

- `?dev`, `?edit=<lieu>` et `&at=<checkpoint>` n’activent les outils de dev que sur le serveur de dev, dans un build de
  démo du Studio ([studio.demo-mode](studio.demo-mode.md)) et dans les prévisualisations d’une révision d’un Studio
  hébergé ([`src/main.ts`](../../src/main.ts)). Sans eux, le jeu du joueur est le même dans tous les builds ; un build
  de production les ignore.
- Tous les autres paramètres ci-dessous sont lus par le moteur dans tous les builds.

> [!LIMIT id=dev-tools-build]
> Les outils de dev ne sont pas dans un build de production : `?dev` et `?edit=` sur un jeu publié montrent le jeu
> normal.

| URL | Effet | Build |
|---|---|---|
| `/` | Le jeu normal : écran titre, Nouvelle partie / Continuer. | tous |
| `/?dev` | Démarre sur le premier checkpoint, avec le calque de débogage et le panneau DEV. | développement |
| `/?dev&at=<checkpoint>` | Démarre sur ce checkpoint (l’un des `checkpoints` du jeu). | développement |
| `/?edit=<lieu>` | L’éditeur de placement du lieu. | développement |
| `/?edit=<lieu>&at=<checkpoint>` | La même chose, dans l’état de ce checkpoint (pour placer un accessoire dans un état donné). | développement |
| `?lang=<code>` | La langue dans laquelle jouer. | tous |
| `?renderer=canvas\|dom` | Impose un peintre à chaque lieu. | tous |
| `?music=mix\|stems` | Impose le mixage unique ou les pistes séparées. | tous |
| `?fps` | Un compteur d’images dans un coin. | tous |
| `?seed=`, `?daily=`, `?world=` | Ouvre un monde Remix. | tous |
| `?reality=sim` | Un lien au monde simulé. | tous |
| `?speedrunTool=<port>` | Envoie les événements de la course à un outil de speedrun local. | tous |
| `?token=<jeton>` | Le jeton du Studio en réseau local. | serveur de dev en mode réseau local |

<a name="dev"></a>

## `?dev` : le calque et le panneau DEV

`/?dev` démarre le jeu sur son premier checkpoint avec la trace du moteur activée, le calque de débogage et le panneau
DEV ([`src/engine/dev/`](../../src/engine/dev/index.ts)).

- **Calque**, affiché par-dessus la scène :
  - zones cliquables en bleu, accessoires en violet, personnages en vert ;
  - zone marchable en vert, trous (meubles) en rouge ;
  - lignes d'échelle en orange, points d'entrée en rose ;
  - points d'approche : pleins s'ils sont définis dans le layout, creux s'ils sont calculés.
- **Afficher ou masquer le calque** : touche **D**, ou bouton **DEV** en bas à gauche (sur téléphone).
- **Panneau** :
  - le lieu courant et l’état « occupé » (un script tourne) ;
  - **Checkpoints** : charger un état prêt, ou démarrer une Nouvelle partie ;
  - **Rooms** : aller dans n'importe quel lieu, sans jouer son script d'arrivée ;
  - **Bag** : cocher ou décocher un objet ;
  - **Flags** : modifier les flags existants, ou poser un flag nom / valeur (`true`, `false`, un nombre ou un texte) ;
  - **Map** : débloquer un lieu, ou **Unlock all** ;
  - **World** : le lieu de chaque personnage mobile (le changer le déplace, `moveActor`) ;
  - **Scripts** : la position de chaque script en cours (`commande suivante / longueur`, fini, arrêté), avec un bouton
    arrêter ou relancer ;
  - **Journal** : les dix dernières entrées du journal du moteur (ce qui a répondu, événements, pas de script,
    déplacements, changements de joueur ; l'onglet Play du Studio le montre en entier), et **Export session** : les
    entrées depuis le début de la partie, avec le journal sémantique de la session, pour `npm run replay` ;
  - **Semantic journal** (4.1.11) : les douze derniers événements que le cœur a numérotés dans cette session (lieu,
    objet gagné ou perdu, drapeau changé, fin, chargement, sauvegarde), rafraîchis avec le panneau ;
  - **Edit this room** : ouvre l'éditeur sur le lieu affiché.

<a name="at"></a>

## `&at=<checkpoint>`

Avec `?dev` ou `?edit=`, démarre sur ce checkpoint, un id des `checkpoints` du jeu, au lieu du premier.

<a name="edit"></a>

## `?edit=<lieu>` : l’éditeur de placement

`/?edit=<lieu>` ouvre l’éditeur de placement du lieu. Au démarrage, il charge le premier checkpoint situé dans ce lieu ;
s’il n’y en a pas, il part d’un état neuf, sans jouer de script d’arrivée. Toutes les coordonnées sont logiques
(640 × 400). Les gestes et le panneau de l’éditeur sont décrits dans
[studio.placement](studio.placement.md#placement-editor).

- **Enregistrer** écrit `games/<GAME>/layout/<lieu>.json` dans le dépôt du moteur (`game/layout/<lieu>.json` dans un
  projet créé), coordonnées arrondies à l’unité, par l’API du Studio (`PUT /__studio/api/room/<lieu>/layout`, une
  opération gardée du journal du jeu : [studio.api](studio.api.md)) ; la page se recharge alors avec le fichier
  enregistré. Là où il n’y a pas d’API du Studio (un build de démo du Studio, un hébergement statique), le layout
  rejoint les modifications de la démo dans ce navigateur. Un refus du Studio est affiché avec sa raison.
- **Dans le Studio** (`/__studio/`), l’éditeur tourne dans une iframe et parle à la page du Studio par `postMessage`,
  vers l’origine du Studio seulement (celle de la page, ou sur un Studio hébergé l’origine que nomme sa balise meta
  `web-scumm-studio-origin`). Il envoie des messages `{ source: 'web-scumm-editor', room, type }` : `ready` (avec
  `missing`, les entités qui n’ont pas encore de place), `select` (`key` comme `prop:lamp`, `hs:door`,
  `actor:grandma`, plus `kind` et `id` pour ces trois-là), `dirty` (modifications non enregistrées) et `saved` (`ok`,
  `error` ; sur un Studio hébergé aussi le `layout` et le `nonce` de la demande, c’est le Studio qui écrit). Il
  accepte des messages `{ source: 'web-scumm-studio', type }` : `select` (`kind`, `id`), `create` (donne une place à
  une entité que le lieu déclare mais que le layout n’a pas, éventuellement en `at`) et `save` (éventuellement avec un
  `nonce`). Dans une iframe, son panneau démarre replié.

<a name="lang"></a>

## `?lang=<code>`

La langue dans laquelle jouer, quand le jeu la fournit : elle passe avant le choix enregistré du joueur et la langue du
navigateur (`pickLanguage`, [engine.api](engine.api.md)). Voir [play.languages](play.languages.md).

<a name="renderer"></a>

## `?renderer=canvas|dom`

Impose un seul peintre à chaque lieu : le contrôle de parité visuelle, la comparaison du Studio. Toute autre valeur est
ignorée et chaque lieu garde son propre `renderer`.

<a name="music"></a>

## `?music=mix|stems`

Impose le mixage unique ou les pistes séparées du directeur (tests, le Studio) ; sinon l’appareil décide
([create.music](create.music.md)).

<a name="fps"></a>

## `?fps`

Un compteur d’images dans un coin (3.8) : la fréquence d’images actuelle et la seconde la plus basse vue, pour la passe
sur un vrai téléphone.

<a name="remix-links"></a>

## `?seed=`, `?daily=`, `?world=` : un monde Remix

Pour un jeu qui déclare `remix` (4.1.15) : `?world=<monde figé>` (son empreinte vérifiée quand il est appliqué),
`?seed=WS-…` (le mode remix) ou `?daily=<jeton du jour signé>` nomme le monde que joue la page. Le monde de la
sauvegarde automatique passe d’abord (Continuer ne disparaît jamais) ; un lien vers un autre monde que celui de la
partie enregistrée est demandé sur l’écran titre, jamais adopté en silence. Voir [create.remix](create.remix.md).

<a name="reality"></a>

## `?reality=sim`

Pour un jeu qui déclare `reality` : le lien au monde est simulé, comme toujours avec les outils de dev actifs, et aucun
Bridge n’est contacté ([bridge.signals-manifest](bridge.signals-manifest.md)).

<a name="speedrun-tool"></a>

## `?speedrunTool=<port>`

La page envoie les événements de sa course (catégorie, ids et noms des splits, temps ; rien d’autre : ni sauvegarde, ni
id du joueur, ni jeton) à un outil local, sur ce port de cette machine : l’overlay OBS ou l’autosplitter LiveSplit
(4.1.14, D23). Le port a de 2 à 5 chiffres ; l’outil ne les accepte que de l’origine qu’il autorise. Voir
[play.speedrun](play.speedrun.md).

<a name="token"></a>

## `?token=<jeton>`

Sur le serveur de dev en mode réseau local (`npm run dev:lan`, `npm run studio:lan`), le jeton de capacité d’une
session que le serveur affiche dans son URL. Donné une fois, il est gardé dans un cookie `HttpOnly`,
`SameSite=Strict` ; une requête sans lui (et sans l’en-tête `x-web-scumm-token`) est refusée avec 401. Voir
[studio.security](studio.security.md) et [create.lan-testing](create.lan-testing.md).
