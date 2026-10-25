# Remix

Remix permet à un même jeu de produire plusieurs parties vraiment différentes : où se trouve un objet, où un
personnage commence et quelle tournée il fait, un code et son indice, l'ordre de deux groupes d'énigmes, une réplique
dite autrement. L'histoire ne devient jamais un contenu aléatoire. Chaque variation est déclarée par l'auteur, finie,
déterministe à partir d'une seed, et comprise par le validateur, le solveur, les sauvegardes, le replay, le Studio et
les outils de speedrun. La conception est
l'[ADR 0018](../../docs/dev/adr/0018-variation-manifest-and-world-variant.md) ; les décisions sont D25 à D28
([`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md)). Remix est arrivé en 4.1.15.

La première moitié de cette page est un tutoriel (déplacer une clé entre trois cachettes), la seconde une référence du
manifeste, des seeds, des outils et de ce que voit le joueur.

<a name="what-you-will-build"></a>

## Ce que vous allez construire

La clé du jeu d'exemple, que le vendeur remet sur son étal dans l'histoire, cachée selon le monde à l'un de trois
endroits du marché : sur l'étal, sous les oranges, dans la lanterne. Une seed comme `WS-0000-02DZ` nomme un monde ; la
même seed donne le même monde sur toutes les machines et tous les navigateurs. À la fin, `npm run remix` affiche le
monde que fait une seed et `npm run verify:variants` prouve que chaque monde se termine.

L'exemple complet est dans le dépôt : [`games/demo/game.ts`](../../games/demo/game.ts) (le manifeste) et
[`games/demo/rooms/market.ts`](../../games/demo/rooms/market.ts) (les ancres et les branches).

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Le dépôt du moteur, installé ([Installer depuis le dépôt](install.from-repository.md)), avec votre jeu ou le jeu
  `demo` sélectionné (`GAME=<id>` ou `npm run game`).
- Un jeu qui se termine déjà : `npm run validate` et `npm run solve` au vert
  ([Vérifier son jeu](create.checking.md)).
- Vingt minutes.

> [!LIMIT id=engine-repo-tools]
> Les outils Remix (`npm run remix`, `npm run verify:variants`, `npm run code-wheel`) sont des scripts du dépôt du
> moteur. La commande `quest-n-click` d'un projet créé n'en a aucun : le manifeste fonctionne dans le jeu, mais ses
> mondes se vérifient depuis un clone du dépôt du moteur.

<a name="steps"></a>

## Étapes

<!-- step: anchors -->
1. **Taguer les emplacements.** Dans la salle, déclarez les ancres où l'objet peut être posé. `anchors` est un
   dictionnaire indexé par l'id de l'ancre ; `at` nomme le prop ou le hotspot sur lequel elle se trouve :

   ```ts
   // games/<id>/rooms/market.ts
   anchors: {
     stall: { at: 'stall', reachableBy: 'bouquet_given', phase: 'deposit' },
     oranges: { at: 'oranges', reachableBy: 'bouquet_given', phase: 'deposit' },
     lantern: { at: 'lantern', reachableBy: 'bouquet_given', phase: 'deposit' },
   },
   ```

   `npm run validate` vérifie désormais que chaque ancre repose sur quelque chose et qu'on peut l'atteindre.

<!-- step: manifest -->
2. **Déclarer le manifeste.** Dans `game.ts`, `remix` liste les modes et les dimensions. Ici, une dimension logique
   déplace la clé et une dimension de présentation change une réplique :

   ```ts
   // games/<id>/game.ts
   remix: {
     schema: 1, algorithm: 'web-scumm-remix-1',
     modes: [
       { id: 'story', strategy: 'catalogue', dimensions: [] },
       { id: 'remix', strategy: 'catalogue', dimensions: ['key-spot', 'oranges-line'] },
     ],
     dimensions: [
       { id: 'key-spot', kind: 'item-placement', item: 'key', logical: true,
         anchors: [{ room: 'market', anchor: 'stall' }, { room: 'market', anchor: 'oranges' }, { room: 'market', anchor: 'lantern' }],
         story: { room: 'market', anchor: 'stall' } },
       { id: 'oranges-line', kind: 'presentation', target: 'line:market.take-oranges.l-oranges-are-not', logical: false, story: 0,
         values: [{ en: 'Oranges are not sardines…', fr: '…' }, { en: 'An orange. Round, bright…', fr: '…' }] },
     ],
     constraints: [{ kind: 'not-behind', item: 'key', action: 'house.use-key-pantry' }],
   },
   ```

<!-- step: branches -->
3. **Écrire les branches.** Une valeur logique différente de sa valeur histoire écrit le drapeau réservé
   `remix.<dimension>` au début de la partie (`remix.key-spot` = `market.oranges`). Le contenu le lit comme n'importe
   quel drapeau :

   ```ts
   // games/<id>/rooms/market.ts, la condition d'une règle
   if: { all: ['bouquet_given', { flag: 'remix.key-spot', eq: 'market.oranges' }, '!hidden_key_found'] },
   ```

   Le monde histoire n'écrit aucun drapeau : on écrit une condition pour chacune des autres valeurs, et l'histoire
   garde son texte. La démo remet la clé dans l'histoire, dit où elle est cachée sinon, et laisse Pixel la prendre sous
   les oranges ou dans la lanterne. `npm run validate` avertit d'une valeur qu'aucune condition ne lit.

<!-- step: look -->
4. **Regarder un monde.**

   ```sh
   # dans le dépôt du moteur, votre jeu sélectionné
   npm run remix -- --seed WS-0000-02DZ
   npm run remix -- --preview WS-0000-02DZ
   ```

   La première affiche la valeur de chaque dimension et l'empreinte du monde ; la seconde y ajoute `validate` et un
   témoin du solveur sur ce monde.

<!-- step: prove -->
5. **Prouver chaque monde.**

   ```sh
   # dans le dépôt du moteur, votre jeu sélectionné
   npm run verify:variants -- --prove
   ```

   Chaque mode est vérifié : dans un catalogue, chaque monde logique est validé et prouvé sans blocage. La commande
   sort en 1 quand un monde échoue, et le nomme.

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Une dimension fait varier une chose parmi des valeurs que vous listez, chacune avec sa valeur histoire
  ([Ce qui varie](#what-varies)).
- Une valeur logique écrit un drapeau `remix.*` que le contenu lit ; une valeur de présentation n'écrit rien
  ([Déclarer un manifeste](#manifest), [Variance de présentation](#presentation)).
- Une seed nomme un monde, le même partout ([Seeds et mondes](#seeds)) ; les mondes d'un catalogue sont tous prouvés
  ([Stratégies par mode](#strategies)).

<a name="next"></a>

## Pour aller plus loin

- [Speedrun pour les auteurs](create.speedrun.md) : des catégories jouées dans des mondes Remix (Fixed, Random, Daily,
  Mystery).
- [Remix dans le Studio](studio.remix.md) : l'onglet Remix, ses aperçus et sa couverture.
- [Ce que prouve le solveur](create.solver-proofs.md) : ce que « prouvé » veut dire pour chaque monde.

<a name="what-varies"></a>

## Ce qui varie, et ce qui ne varie jamais

Une dimension fait varier une chose parmi des valeurs que l'auteur énumère, chacune avec sa valeur **histoire** (le
monde tel qu'il est écrit) :

| `kind` | Ce qu'elle fait varier | Ses champs |
|---|---|---|
| `item-placement` | un objet sur l'une de plusieurs ancres taguées | `item`, `anchors` (`{room, anchor}`), `story` (une ancre) |
| `actor-start` | la salle où commence un personnage | `actor`, `rooms`, `story` (une salle) |
| `actor-route` | le script qui sert de tournée | `actor`, `routes` (ids de scripts), `story` |
| `coupled` | un code et son indice, tirés ensemble | `pairs` (`{hint, answer}`), `story` (un indice) |
| `puzzle-order` | un ordre de groupes d'énigmes qui garde les arêtes de l'auteur | `groups` (1 à 8), `graph` (`[a, b]` : `a` avant `b`), `story` |
| `presentation` | une réplique, une image, une palette ou un paramètre de minijeu | `target`, `values`, `story` (un indice) |

Chaque dimension a un `id` et `logical: true`, sauf `presentation`, qui est `logical: false`. Remix ne réordonne
jamais les règles (leur ordre peut porter un sens), n'écrit jamais un texte, n'invente jamais une dépendance : l'auteur
écrit chaque branche avec les conditions que le DSL a déjà.

<a name="manifest"></a>

## Déclarer un manifeste

Le manifeste est `remix` dans `game.ts` (`GameDef.remix`, type `VariationManifest`) :

- `schema: 1` et `algorithm: 'web-scumm-remix-1'`, obligatoires tels quels.
- `modes` : chacun `{ id, strategy: 'catalogue' | 'generator', dimensions, mask? }`. Les dimensions qu'un mode ne nomme
  pas gardent leur valeur histoire. `mask: true` cache ce que révèle la seed jusqu'à la fin (un run Mystery).
- `dimensions` (tableau ci-dessus) et `constraints` (plus bas).
- `daily` (facultatif) : `{ kid, publicKey, mode }`, la clé du Bridge qui signe le défi du jour (Ed25519, brute,
  base64url), pour que le joueur vérifie la seed du jour hors ligne.

Les drapeaux qu'écrit une dimension logique sont `remix.<dimension>` ; un ordre d'énigmes écrit
`remix.<dimension>.<groupe>` (la position du groupe). On les lit avec `{ flag: 'remix.key-spot', eq: 'market.oranges' }` ;
la valeur d'un placement d'objet est `<salle>.<ancre>`.

**Champs inconnus.** Le manifeste est vérifié contre un schéma strict
([`src/engine/core/remix/manifest.ts`](../../src/engine/core/remix/manifest.ts)) : une clé inconnue, un champ manquant
ou un littéral faux est refusé, avec le chemin de l'erreur. Un manifeste qui ne peut produire aucun monde (un domaine
vidé par ses contraintes, par exemple) est une erreur de build qui liste toutes les raisons.

<a name="anchors"></a>

## Ancres et placement d'objets

Une ancre est un emplacement tagué d'une salle, `anchors` dans `rooms/<salle>.ts` :

| Champ | Sens | Par défaut |
|---|---|---|
| `at` | le prop ou le hotspot sur lequel elle se trouve | obligatoire |
| `visible` | quand elle se montre (une condition) | toujours |
| `reachableBy` | ce qu'il faut pour l'atteindre (une condition) | rien |
| `capacity` | combien d'objets elle tient à la fois | 1 : deux objets ne la partagent jamais sauf si elle le dit |
| `phase` | une étiquette par laquelle le Studio regroupe, et que `verify:variants` compte | aucune |

Le validateur refuse une ancre posée sur rien, une ancre dans une salle que le départ ne peut atteindre, et une ancre
qu'on n'atteint qu'avec l'objet qui y est posé. Trois contraintes lient les dimensions :

- `not-behind` (`{ item, action }`) : retire les ancres situées derrière une règle qui exige l'objet ;
- `exclusive` (`{ dimensions }`, deux au moins) : deux d'entre elles ne prennent jamais la même valeur ;
- `requires` (`{ a, b }`, chacun `<dimension>=<valeur>`) : quand `a` vaut, `b` vaut.

<a name="characters-codes-orders"></a>

## Personnages, codes et ordres

- `actor-start` change la salle de départ du personnage. Chaque salle candidate doit déclarer un acteur pour lui ; le
  solveur prouve que le personnage est là où chaque monde a besoin de lui.
- `actor-route` nomme des scripts : le `while` de chacun lit le drapeau (dans
  [`games/reference/game.ts`](../../games/reference/game.ts), `seller_rounds` et `seller_rounds_late`).
- `coupled` associe un indice (un texte, ou un par langue) à une réponse. `{code:<id>}` dans n'importe quel texte
  devient la réponse et `{hint:<id>}` l'indice, dans toutes les langues à la fois, après la traduction. Le contenu
  accepte la réponse par le drapeau : voir le mot de passe de la fête dans
  [`games/reference/rooms/hall.ts`](../../games/reference/rooms/hall.ts) et la devinette de Grand-mère dans
  `kitchen.ts`.
- `puzzle-order` écrit la position de chaque groupe : `remix.festival-order.board` = 0 quand le panneau vient d'abord.

<a name="presentation"></a>

## Variance de présentation

La cible (`target`) d'une dimension `presentation` est l'une de :

- `line:<id de réplique>`
- `prop-img:<salle>.<prop>`
- `palette:<personnage>`
- `minigame:<id de règle>:<paramètre>` : un texte ou un décor de minijeu seulement. Un paramètre qui pourrait décider
  d'une victoire, comme les réponses d'une roue ou une difficulté, est refusé, puisqu'une preuve est indexée par le
  monde logique.

Elle tire du flux `cosmetic`, n'écrit aucun drapeau, ne prend aucune contrainte, et reste hors de l'espace du solveur
(D27) : deux mondes qui ne diffèrent que par la présentation partagent leur preuve. Ajouter une dimension de
présentation ne déplace aucun tirage logique.

<a name="seeds"></a>

## Seeds et mondes

Une seed est `story` ou un code `WS-XXXX-XXXX` : sept symboles en base32 de Crockford et un symbole de contrôle. La
saisie pardonne la casse, `I` et `L` (lus `1`), `O` (lu `0`), les espaces et les tirets ; un symbole faux est une
erreur explicite, jamais un autre monde.

> [!GUARANTEE id=seed-typo-caught]
> Un code dont l'un des quatre premiers symboles est mal tapé est refusé par son symbole de contrôle : il n'ouvre jamais
> un autre monde.

Les poids du symbole de contrôle sont impairs : un symbole faux n'importe où dans le code le change aussi.

Le même jeu, le même manifeste, la même seed et la même version d'algorithme donnent le même `WorldVariant` : la seed,
l'algorithme et sa version, l'empreinte du manifeste, le mode, une valeur par dimension, et un SHA-256 du tout. Les
tirages viennent du seul générateur à seed, un flux par dimension ; `Math.random` est interdit dans `src/engine/core`
par le linter et par un test. Que ce soit le même dans Node est testé à chaque exécution ; `npm run e2e:remix` compare
les mondes et les roues de code de 50 seeds (500 dans la nightly et le candidat de release) dans Node, Chromium, WebKit
et Firefox, dans le job multi-runtime de la CI. Un code ne dit rien du joueur
([`docs/dev/threat-models/remix-seed.md`](../../docs/dev/threat-models/remix-seed.md)) : c'est le nom d'un monde, pas
un secret.

<a name="strategies"></a>

## Stratégies par mode

Chaque mode dit ce qui soutient ses mondes (D25) :

- Un **catalogue** énumère chaque monde logique (10 000 au plus, `CATALOGUE_MAX` ; au-delà, il est refusé) et chacun
  est validé et résolu : chacun est un gate de release.
- Un **générateur** construit un monde par construction ; ses invariants sont testés par propriétés et son
  échantillon publié de seeds est résolu. On ne dit jamais que toutes les seeds sont prouvées.

Les jeux livrés n'utilisent que des catalogues.

> [!MEASURE id=bundled-worlds-proved]
> Chaque monde logique des jeux livrés prouvé de façon exhaustive, aucun blocage : `demo` histoire 1 et remix 3
> mondes ; `reference` histoire 1, et remix, daily et mystery 24 mondes chacun.
> - date: 2026-10-07
> - version: 4.1.15
> - volume: 1 + 3 mondes (`demo`), 1 + 3 × 24 mondes (`reference`)
> - conditions: `npm run verify:variants -- --prove --max=200000`, preuve exhaustive par monde logique
> - source: [docs/en/REMIX.md, « Strategies per mode »](https://github.com/Quest-n-Click/quest-n-click/blob/d7ed9c01022306fe34b2da5af666eaff4bd056a5/docs/en/REMIX.md)

Le chemin générateur est exercé par une fixture de test
([`tests/fixtures/remix-extension.ts`](../../tests/fixtures/remix-extension.ts), 527 280 mondes logiques) : 10 000
seeds donnent des mondes valides (un test par propriété) ; aucun n'est déclaré prouvé.

<a name="tools"></a>

## Outils

Tous dans le dépôt du moteur, pour le jeu sélectionné :

| Commande | Fait |
|---|---|
| `npm run remix -- --seed <code>` | affiche un monde et son empreinte ; `--json` le `WorldVariant` entier ; `--mode=<id>` (`remix` par défaut) ; `--version=<n>` une version d'algorithme |
| `npm run remix -- --preview <code>` | le même monde, puis `validate` et un témoin du solveur dessus (`--max=<états>`, 20 000 par défaut) |
| `npm run remix -- --record=20` | les seeds de playtest : les N premières seeds de l'échantillon publié, chacune résolue et son témoin écrit en session dans `games/<id>/playtests/remix-<seed>.session.json`, que `npm run playtests` rejoue dans son propre monde |
| `npm run verify:variants` | chaque mode : chaque monde d'un catalogue, l'échantillon d'un générateur (`--sample=50`), avec la couverture par dimension et par couple, les valeurs jamais choisies, les dominantes sur 1 000 seeds (`--draws`), un certificat par monde logique dans `.cache/proofs/variants/` ; `--prove` la preuve exhaustive, `--max=<états>` (20 000 par défaut), `--out=<fichier>` le rapport que publie la release. Sortie 1 quand un monde échoue |
| `npm run e2e:remix` | les mondes et les roues de code de 50 seeds comparés entre Node, Chromium, WebKit et Firefox (`--seeds=`, `--browsers=` ; sortie 3 quand un navigateur ne se lance pas, 0 avec `--allow-skip`) |
| `npm run code-wheel -- --game <id> --format svg\|pdf` | la roue de code imprimable ([plus bas](#code-wheel)) |

Un jeu sans manifeste `remix` n'a qu'un monde, l'histoire : `npm run remix` le dit et sort en 1.

<a name="saves-replays"></a>

## Sauvegardes, replays et speedruns

Une sauvegarde est l'enveloppe v4 (`SaveEnvelopeV4`) : l'enveloppe v3 et le monde. Une sauvegarde faite avant 4.1.15
reçoit le monde histoire. Une sauvegarde n'est jamais chargée dans un autre monde : `SaveWorldMismatch` nomme le monde
à reconstruire.

> [!GUARANTEE id=save-other-world-refused]
> Une sauvegarde d'un monde Remix porte ce monde ; la charger dans un autre monde est refusé, et le monde à
> reconstruire est nommé.

La session enregistre le monde (`Session.variant`), et un replay le reconstruit depuis l'affectation stockée, jamais
depuis la seed avec un générateur plus récent. Les catégories de speedrun sont Story, Fixed (une seed publiée), Random
(tirée au départ et montrée), Mystery et Daily ; Fixed et Daily classent chaque seed à part (`leaderboardKey`), et
`worldVerdict` vérifie le monde d'un run contre ce que sa catégorie permet : voir
[Speedrun pour les auteurs](create.speedrun.md#worlds). Les formats de fichiers sont dans
[Formats de fichiers](engine.file-formats.md).

<a name="daily-mystery"></a>

## Le défi du jour et Mystery

Le module quotidien du Bridge ([`bridge/src/daily.ts`](../../bridge/src/daily.ts)) signe la seed et les règles du jour
pour 24 heures (`GET /v1/daily`) ; le joueur vérifie le jeton hors ligne avec la clé publique de `remix.daily`. Mystery
est un engagement : `POST /v1/commit` publie le hash signé d'une seed et d'un nonce avant le run, `GET /v1/reveal/:id`
la seed après. La seed du jour ne dépend que du jour, et une seed Mystery est fixée avant que son engagement soit
signé : le Bridge ne choisit jamais une seed après avoir vu des actions (D26).

`bridge serve` le monte depuis la section `daily` d'une configuration (4.1.16 ; voir
[Installer et lancer le Bridge](bridge.install-run.md)), et le menu Remix du lecteur a une entrée Défi du jour et
(4.1.17) une entrée Monde mystère quand le jeu nomme son Bridge.

> [!LIMIT id=reference-daily-key]
> La clé quotidienne du jeu de référence est une clé de test publiée : ses défis montrent le mécanisme, pas la
> confiance. Un jeu qui veut de vrais défis du jour livre sa propre clé.

<a name="code-wheel"></a>

## La roue de code

« The Extremely Legitimate Pirate Check » est un minijeu, `code-wheel` : deux disques tirés des personnages, symboles
et réponses du jeu ; on tourne le petit disque jusqu'à placer un symbole sous un personnage, et on lit sa fenêtre. La
seed la tire du flux `copy-protection` : la même seed donne la même roue partout. Le validateur vérifie que chaque roue
a une solution ; le solveur la traite comme gagnable.

Modes (`mode`) : `parody` (le défaut : après trois mauvaises réponses, elle laisse passer), `story`, `strict` (ne
laisse jamais passer, ne se passe pas), `cosmetic` (toute réponse est acceptée), `disabled`, `daily`.

Elle tourne avec des boutons, les flèches et une manette, annonce chaque tour, liste la roue entière en texte, et ne
s'anime pas sous mouvement réduit. Elle se joue entièrement au clavier (les flèches la tournent, Tab et Entrée
répondent, Échap passe) et à la manette (gauche et droite tournent, haut et bas choisissent une réponse, A confirme,
B passe), et le focus revient au jeu à sa fermeture.

```sh
# dans le dépôt du moteur
npm run code-wheel -- --game <id> --format svg|pdf [--seed <code>|story] [--out <dir>]
```

imprime les disques, les repères de découpe, le trou central et un livret, en couleur et en version économique. Les
pages SVG sont toujours écrites ; le PDF demande Pillow (`npm run doctor` dit s'il est là ; sans lui, la commande le
dit et garde le SVG). C'est une reconstitution ludique, jamais un DRM ; la direction artistique est celle du jeu.

**Son issue compte** (4.1.16). La roue finit `won`, `passed` (la clémence de la parodie), `skipped`, `failed` (une
roue `story` perdue après ses essais : l'histoire continue avec) ou `disabled`. Le moteur enregistre le résultat dans la
session (le `mg` de l'entrée, réinjecté au rejeu comme un choix) et l'écrit dans le drapeau réservé
`minigame.code-wheel`, que l'histoire lit avec `{ flag: 'minigame.code-wheel', eq: 'failed' }` et que le journal
rapporte en `flagChanged`. Une commande ne pose jamais un drapeau `minigame.*` (le validateur le refuse). Chaque
minijeu dit comment il a fini dans le lecteur (passé, sinon gagné) ; celui qui ne dit rien (le solveur, le rejeu d'une
session 4.1.15) n'enregistre rien.

Une catégorie de speedrun dit ce qu'elle permet de la roue dans `world.codeWheel` : `skip: false` la veut gagnée,
`enabled: false` la veut non jouée (passée ou désactivée), `medium` vaut `digital`, `physical` ou `either`, et
`proof: 'transcript'` (4.1.17) exige les réponses qui donnent le résultat. Voir
[Speedrun pour les auteurs](create.speedrun.md#trust).

> [!LIMIT id=wheel-result-word]
> Un résultat enregistré est la parole du joueur, comme le support : le rejeu vérifie qu'il a été enregistré et le
> rejoue, pas qu'il a été mérité (sauf si la catégorie exige un transcript). Le solveur, dont les minijeux ne disent
> rien, n'explore pas les branches qu'une histoire accroche à `minigame.*` : elles ne sont pas cherchées.

<a name="player-studio"></a>

## Le joueur et le Studio

L'écran titre gagne **Remix** (après Nouvelle partie et Continuer) : l'histoire, un nouveau monde, une seed tapée ou le
défi du jour. La page redémarre dans le monde choisi. Le menu pause montre le code à copier, ou « caché jusqu'à la
fin » dans un mode masqué. Les options d'accessibilité ne touchent jamais la seed. Un lien nomme un monde (`?seed=`,
`?daily=`, `?world=`).

L'onglet **Remix** du Studio liste les dimensions, prévisualise une seed, verrouille des dimensions et relance les
autres, compare deux mondes, dessine un ordre d'énigmes, compte couverture et biais, liste les ancres et en ajoute une
depuis la sélection de l'onglet Salles, et joue ou exporte un monde : voir [Remix dans le Studio](studio.remix.md).
