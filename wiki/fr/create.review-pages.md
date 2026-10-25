# Pages de relecture : valider depuis un téléphone

Cinq pages HTML générées permettent à l’auteur de vérifier le jeu loin de l’ordinateur. Trois reçoivent des
annotations : le **storyboard**, la **relecture des sprites** et la page de **placement**. Deux sont des images en
lecture seule : le **monde** et les **puzzles**. Chaque page est un seul fichier autonome (images intégrées, sans
serveur), fait pour être publié comme artifact claude.ai : l’auteur annote sur son téléphone, l’IA relit les
annotations et agit.

<a name="commands"></a>

## Commandes

```
npm run page:storyboard              # → dist-pages/storyboard.html   (il faut games/<id>/storyboard.json)
npm run page:storyboard -- --md      # écrit aussi games/<id>/storyboard.md (texte brut pour les agents)
npm run page:review                  # → dist-pages/review.html
npm run page:placement               # → dist-pages/placement.html
npm run page:world                   # → dist-pages/world   (sans extension .html : --out world.html pour en avoir une)
npm run page:puzzles                 # → dist-pages/puzzles (sans extension .html : --out puzzles.html pour en avoir une)
npm run import-layout -- <file|dir>  # fusionne des layouts exportés dans games/<id>/layout/<room>.json (--dry pour prévisualiser)
```

À lancer **dans le dépôt du moteur**, sur votre machine. Options : `--out <dossier>` ou `--out <fichier.html>`. Le jeu
est le jeu courant (`GAME=<id>`, sinon celui choisi par `npm run game`, sinon `config.game` de `package.json`) ;
`GAME_DIR=<chemin>` désigne un dossier de jeu hors de `games/` (par exemple `tests/fixture`).

> [!LIMIT id=engine-repo-only]
> La commande `quest-n-click` d’un projet créé ne propose ni ces pages ni `import-layout`. Dans un projet créé, le
> Studio (`npm run studio`) montre la même chose : l’onglet Storyboard, l’onglet Assets, l’éditeur de placement, et les
> graphes du monde et des puzzles dans l’onglet Check.

Les images viennent de `games/<id>/art/` (en suivant `sources.json`, comme `npm run assets`), ou de
`public/assets/img/` déjà préparé quand le manifeste du jeu les liste. Avec `python3` et Pillow installés, elles sont
réduites en vignettes WebP (en cache dans `.cache/pages/`) ; sans, les fichiers sont intégrés tels quels et la page
grossit. Gardez une page sous 16 Mo, la limite d’un artifact : le générateur affiche la taille de la page et avertit
au-dessus.

<a name="the-three-pages"></a>

## Les trois pages annotées

<a name="storyboard-page"></a>

### Storyboard

`tools/pages/storyboard.ts`, schéma dans [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md).
Une section par tableau : le décor du lieu, le but, puis chaque case avec son action, ses répliques (portrait, nom,
texte), ses sons, et une zone de notes. Les sujets de conversation, les réactions facultatives et les indices suivent.
Les notes vont dans la collection `notes` (id du document = id de la case ; aussi `general`,
`<board>__talk__<character>`, `<board>__reactions`, `<board>__hints`). Ce que Claude écrit dans la collection
`rewrites` sous le même id s’affiche en vert sous la note. Les ids se limitent aux lettres, chiffres et
`_ - . ~ : @ +` ; les autres caractères deviennent `_`.

La page refuse un storyboard invalide avec les mêmes phrases que le Studio et l’outil MCP `set_storyboard`. À quoi sert
le storyboard : [Le storyboard, source de vérité](create.storyboard.md).

<a name="review-page"></a>

### Relecture des sprites

`tools/pages/review.ts`. Chaque dossier de `games/<id>/art/` est une planche, chaque image dedans une case (les
sous-dossiers, comme les kits de parole, sont inclus : la case est `pose/t1`). Chaque case est marquée *used* quand le
jeu la cite (mêmes règles que `tools/refs.ts` et `npm run assets`, donc les surcharges de `sources.json` comptent),
avec les ids qui la citent. Les ids cités par le jeu sans fichier sont listés en haut. Par case : garder / refaire /
inutilisée et une note, enregistrés dans la collection `decide` (id `<sheet>__<cell>`, valeur
`{ choice, note, sheet, cell, used, updatedAt }`). Filtres : toutes, utilisées, non utilisées, sans décision, à
refaire. Comment se font les planches : [Images](create.images.md).

<a name="placement-page"></a>

### Placement

`tools/pages/placement.ts`. Un lieu à la fois, sur son décor (640 × 400 unités logiques, à l’échelle de l’écran). On
fait glisser au doigt ou à la souris :

- les accessoires et les acteurs par leur corps (les pieds = le point blanc), leur hauteur avec le point bleu, leur
  point d’approche avec le losange rose (« Add approach » en crée un) ; les acteurs sont dessinés à l’échelle de leur
  profondeur, comme dans le jeu ;
- les zones cliquables (rectangles : déplacer, redimensionner avec le point du coin ; polygones : déplacer les points) ;
- les points de la zone de marche (choisir « Walk area » ; toucher un point, puis « Add point » après lui ou « Delete
  point ») ;
- les entrées (anneaux ; le héros est dessiné en transparence sur `default`, à son échelle) et les deux lignes
  d’échelle (tirets bleus).

Ce qui manque au layout est montré au milieu avec un badge « to place », en pointillés, et n’est écrit qu’une fois
déplacé. Chaque changement enregistre `{ room, layout }` dans la collection `layouts` (id = id du lieu). « Export room »
donne le layout du lieu, de la même forme que `games/<id>/layout/<room>.json` ; « Export JSON » donne
`{ "layouts": { "<room>": … } }`. La page ne modifie ni les positions par état, ni la rotation, ni `z`, ni `on` : ces
clés restent telles quelles. Pour un travail fin, utilisez l’éditeur en jeu (`npm run dev`, puis `?edit=<room>`) ou le
Studio : voir [Placement et scène](studio.placement.md).

<a name="world-page"></a>

## La page du monde

`npm run page:world` dessine les lieux et les passages entre eux (sorties déclarées en trait plein, commandes `goto` en
tirets, lieux de la carte marqués), liste les lieux inaccessibles et les sorties sans retour, et affiche la source DOT
pour Graphviz. En lecture seule : ni annotations, ni base de l’artifact. La même image est dans l’onglet Check du
Studio.

<a name="puzzles-page"></a>

## La page des puzzles

`npm run page:puzzles` dessine le graphe des puzzles : les choses (objets, flags, accessoires, lieux, événements,
personnages déplacés) en couleur, les actions (règles, sujets, scripts, écouteurs, buts de chapitre) en blanc ; flèches
grises pour ce dont une action a besoin, en pointillés quand c’est lu dans ses commandes, vertes pour ce qu’elle
produit, rouges en tirets pour ce qu’elle consomme. Touchez une chose pour sa fiche : obtenue par, consommée par,
utilisée par, demande d’abord, débloque, en aval. La page liste ce qui est lu sans jamais être produit et ce qui est
produit sans jamais servir, et affiche le tableau d’ensemble et la source DOT. En lecture seule. Comment la lire en
concevant : [Concevoir des énigmes](create.puzzle-design.md#puzzle-graph).

<a name="annotations"></a>

## Où vont les annotations

Chaque page annotée montre une ligne d’état en haut et un bouton **Export JSON**. Elle marche de trois façons :

1. **Publiée comme artifact, avec la capacité `db`** : chaque changement est enregistré dans la base de l’artifact, et
   la page suit les changements en direct, y compris ceux de Claude. État : « Connected ».
2. **Ouverte comme simple fichier** (un navigateur, une pièce jointe) : les changements sont enregistrés dans le
   `localStorage` du navigateur. Export JSON copie les données dans le presse-papiers et télécharge un fichier
   `.json` : renvoyez-le.
3. **En lecture seule** (la personne n’a pas le droit d’écrire dans la base) : les modifications restent sur
   l’appareil ; Export JSON marche toujours.

Une copie locale est toujours gardée : une page rouverte sur le même appareil montre ce qui a été saisi, même hors
ligne.

<a name="publish-read-back"></a>

## Publier et relire (Claude Code)

<!-- step: publish -->
1. Construisez la page, puis publiez-la avec l’outil Artifact en déclarant la base : `capabilities: { db: {} }`.
   Republiez à la même URL après chaque régénération (même chemin de fichier dans la même session, ou passez `url`) :
   la base est gardée d’une version à l’autre.

<!-- step: share -->
2. Envoyez le lien à l’auteur. Seules les personnes avec des droits d’édition (Contributor ou plus) peuvent écrire.

<!-- step: read-back -->
3. Lisez les annotations avec l’outil **ArtifactData**, `action: "list"`, sur l’`url` de l’artifact :
   - storyboard : collection `notes` ; répondez en écrivant `rewrites/<id de case>` avec `{ "text": "…" }` (`set`) ;
   - relecture : collection `decide` ; listez les cases `redo` avec leurs notes, un prompt de régénération par
     planche ;
   - placement : collection `layouts` ; enregistrez les documents dans un fichier JSON et importez-les
     ([plus bas](#import-layouts)).

<!-- step: plain-file -->
4. Si l’auteur a utilisé un simple fichier, il renvoie le JSON exporté : même contenu, lisez-le directement.

La méthode d’ensemble pour travailler avec un assistant est dans [Travailler avec une IA](create.working-with-ai.md).

<a name="validate-the-storyboard"></a>

## Valider le storyboard sur une page

La deuxième étape de la méthode, une fois l’histoire écrite sous forme de données : `npm run page:storyboard` rend le
storyboard en page illustrée, chaque case composée avec les vrais décors et sprites (dès qu’ils existent), avec les
répliques, les sons jouables, et une zone de notes sous chaque case. Publiez-la comme artifact : l’auteur annote depuis
son téléphone, l’IA relit les notes (ArtifactData) et réécrit le storyboard. On recommence jusqu’à ce que l’auteur dise
« v finale ». Alors seulement, on écrit les lieux.

<a name="import-layouts"></a>

## Importer des layouts

```
npm run import-layout -- exported.json          # un fichier
npm run import-layout -- ./layouts/ --dry       # chaque .json d'un dossier, en prévisualisation
```

Fichiers acceptés : l’Export JSON de la page (`{ "layouts": { … } }`), Export room (`<room>.json`, le lieu est le nom
du fichier), un document de la base (`{ "room", "layout" }`), ou une liste de documents telle qu’ArtifactData la renvoie
(`[{ "id", "data": { "room", "layout" } }]`).

Seules les clés présentes dans l’export changent : `hotspots`, `props`, `actors` et `entries` sont fusionnés id par id
(chaque entité exportée remplace celle enregistrée), `walk`, `scale` et `floor` sont remplacés s’ils sont présents. Les
suppressions faites sur la page (« Unplace », « Remove approach ») ne sont donc pas importées : supprimez ces clés à la
main ou dans l’éditeur en jeu. La commande affiche chaque changement (`+` ajouté, `~` modifié) et
`<n> room(s) updated in …` (`would change` avec `--dry`). Lancez ensuite `npm run validate` et regardez le lieu
(`?dev&at=<checkpoint>`).

> [!GUARANTEE id=import-layout-merges]
> `import-layout` remplace les entités exportées, et garde les autres entités et les clés que l’export ne portait pas.

<a name="related"></a>

## Voir aussi

- Sources : [`tools/pages/`](../../tools/pages/storyboard.ts) (`storyboard.ts`, `review.ts`, `placement.ts`,
  `world.ts`, `puzzles.ts`, `import-layout.ts`, `lib.ts`), [`tests/pages.test.ts`](../../tests/pages.test.ts).
- [Le storyboard, source de vérité](create.storyboard.md) · [Images](create.images.md) ·
  [Placement et scène](studio.placement.md) · [Vérifier dans le Studio](studio.check.md) ·
  [Travailler avec une IA](create.working-with-ai.md).
