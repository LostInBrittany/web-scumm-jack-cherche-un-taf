# Le storyboard, source de vérité

`storyboard.json` contient le script d’un jeu : un tableau par lieu, une case par temps fort, qui dit quoi, l’action du
joueur qui déclenche chaque temps fort, les sons et les indices. La méthode fait du storyboard la source de vérité de
tous les textes, et les lieux s’écrivent à partir de lui. Pourtant le moteur ne le lit jamais. Cette page explique ce
que ce choix apporte, où le storyboard et le jeu peuvent diverger, et comment les garder alignés.

<a name="story-first"></a>

## L’histoire d’abord, sous forme de données

Écrivez l’histoire en **storyboard** avant tout fichier de lieu : des tableaux (un par lieu), des cases (une par temps
fort), des répliques (qui dit quoi), l’action du joueur qui déclenche chaque temps fort, les sons, et les indices que
donne la voix d’aide quand le joueur bloque. Le fichier est `games/<id>/storyboard.json` dans le dépôt du moteur,
`game/storyboard.json` dans un projet créé. Le code découle du storyboard, jamais l’inverse.

Avant d’écrire, répondez aux quatre questions de [L’histoire d’abord](create.puzzle-design.md#story-first) (prémisse,
envie, obstacle par lieu, fin) et lisez [Concevoir des énigmes](create.puzzle-design.md) : ce qui fait un bon lieu, une
bonne énigme, une bonne chaîne d’indices et une bonne couche de repli avec ce moteur. Dans le dépôt du moteur, Claude
Code dispose d’une compétence `/storyboard` (`.claude/skills/`) qui écrit le fichier avec vous ; elle n’est pas livrée
dans un projet créé.

<a name="why"></a>

## Pourquoi un storyboard, et pourquoi la source de vérité

- **On juge l’histoire avant de la construire.** Un storyboard est court, lisible et se relit sur un téléphone
  ([Pages de relecture](create.review-pages.md#validate-the-storyboard)). Changer une case coûte une phrase ; changer un
  lieu coûte du code, du placement, des images et des preuves.
- **Chaque texte a une seule maison.** Répliques, sujets et indices s’écrivent une fois, dans l’ordre où le joueur les
  rencontre. Les lieux les recopient ; un auteur ou un traducteur les lit à un seul endroit.
- **Un assistant travaille mieux à partir de lui.** `npm run page:storyboard -- --md` (ou **Export Markdown** dans le
  Studio) écrit `storyboard.md`, du texte brut que les sous-agents lisent avant d’écrire un lieu ; les outils MCP
  `get_storyboard` et `set_storyboard` lisent et écrivent le JSON.

<a name="divergence"></a>

## Où le storyboard et le jeu divergent

Le jeu tourne à partir des lieux (`rooms/*.ts`, `cast.ts`, `rules.ts`…), pas de `storyboard.json`. Rien ne recopie
automatiquement une réplique de l’un vers l’autre. Ils peuvent donc différer, de trois façons :

1. **Les lieux ont changé, pas le storyboard.** Une réplique réécrite dans l’onglet Rooms du Studio (il modifie la
   chaîne dans le fichier du lieu) ou à la main reste ancienne dans le storyboard.
2. **Le storyboard a changé, pas les lieux.** Une case ajoutée après l’écriture du lieu n’est pas dans le jeu tant que
   personne ne l’écrit.
3. **Deux éditeurs du même fichier.** Dans le Studio local, l’onglet Storyboard garde chaque modification en mémoire
   jusqu’à **Save**, qui écrit tout le document. Si `storyboard.json` change sur le disque entre-temps (une IA, un
   éditeur, git), un bandeau propose de recharger ; avec des modifications non enregistrées, il prévient
   qu’enregistrer écraserait ce changement. Sur un Studio hébergé, le storyboard appartient au pan `story` (« story
   and storyboard ») : le membre qui l’édite en tient le bail, et l’enregistrement d’un autre membre est refusé avec
   une 423 ([pan verrouillé](team.write-refused-423.md)), ou avec une 409 si le fichier a changé depuis sa lecture
   ([révision de base dépassée](team.write-refused-409.md)).

**La couverture** mesure les deux premiers cas. Elle confronte le storyboard enregistré au contenu : le lieu de chaque
tableau, chaque personnage qui parle, réplique, sujet, son et action de case est `ok` (trouvé), `partial` (les morceaux
existent mais pas le tout : les entités mais pas de règle, une réplique proche, un personnage absent de ce lieu),
`missing` (le jeu n’en a rien) ou `unknown` (de la prose que le vérificateur ne sait pas lire). La même vérification
alimente les badges du Studio sur chaque tableau et chaque case (« ✓ » tout est dans le jeu, « ~ » en partie, « ✗ »
manquant), le panneau **Storyboard coverage** de l’onglet Check, l’outil MCP `storyboard_coverage`, et
`npm run page:storyboard`.

> [!GUARANTEE id=storyboard-coverage-reports-missing]
> Une case dont le lieu, un personnage, une réplique ou un son manque au jeu est signalée manquante, pas marquée comme
> présente dans le jeu.

> [!LIMIT id=coverage-is-textual]
> La couverture compare du texte et des ids ; elle ne joue pas le jeu. L’action d’une case est rapprochée des règles en
> prose (« Open Grandpa's armchair »), donc une formulation libre peut rester `unknown`. Une réplique que le jeu a,
> mais reformulée au-delà de « proche », est `missing`. La couverture dit où regarder ; le solveur et les playtests
> disent si le jeu marche.

<a name="write-it"></a>

## L’écrire comme un storyboard

Le schéma est [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md). Les habitudes qui le
rendent utile :

- **Un tableau par lieu**, dans l’ordre du jeu, avec son `goal`. Le jeu d’exemple a `opening`, `house`, `garden`,
  `market`, `finale`.
- **Une case par temps fort.** Un temps fort, c’est quelque chose qui change : un objet obtenu, une porte ouverte, une
  révélation.
- **Chaque case nomme l’`action` du joueur** qui la déclenche : `garden-1` « Pick up pipe », `garden-3` « Use pipe
  with water tank → minigame pipes », `garden-5` « Look at sock ». Si vous ne savez pas écrire l’action, ce temps fort
  n’est pas encore une énigme.
- **`talks`, `reactions` et `hints`** se placent sur le tableau. Les réactions sont les gags facultatifs ; les indices
  vont du vague au précis.
- Une réplique est `{ "who", "text" }` : `who` est un id de personnage, `"hero"` (le héros, quel qu’il soit),
  `"action"` (une action du joueur) ou `"stage"` (une didascalie) ; un id inconnu s’affiche tel quel, en gris, tant que
  le personnage n’existe pas.
- Les ids de case sont uniques dans tout le storyboard : les notes s’y accrochent. Limitez-les aux lettres, chiffres
  et `_ - . ~ : @ +`.

Un storyboard invalide (un tableau sans `id`, des cases qui ne sont pas une liste, une réplique de la mauvaise forme)
est refusé avec les mêmes phrases par le générateur de pages, le serveur du Studio, sa démo dans le navigateur et
`set_storyboard`. Le bouton Save du Studio refuse aussi les ids de case en double ou vides.

<a name="steps"></a>

## Garder le storyboard et le jeu alignés

Dans le dépôt du moteur (`games/<id>/`) ou le projet créé (`game/`), sur votre machine.

<!-- step: write-storyboard -->
1. **Écrire ou changer le storyboard d’abord** : à la main, dans l’onglet Storyboard du Studio, ou avec un assistant
   (`set_storyboard`). Relisez-le sur une page jusqu’à ce que l’auteur le dise final.

<!-- step: write-rooms -->
2. **Écrire les lieux à partir de lui** : recopiez répliques, sujets et indices dans les fichiers de lieu
   ([Lieux](create.rooms.md)).

<!-- step: check-coverage -->
3. **Vérifier la couverture.** Ouvrez le Studio (`npm run studio`, dans les deux contextes) et lisez les badges et la
   Storyboard coverage de l’onglet Check, ou, dans le dépôt du moteur, lancez :

   ```bash
   # dans le dépôt du moteur
   npm run page:storyboard
   ```

<!-- step: fix-drift -->
4. **Corriger chaque écart du côté qui a tort.** Quand le jeu a raison (une meilleure réplique trouvée en écrivant),
   recopiez-la dans le storyboard, pour qu’il reste la référence des traducteurs et des comédiens. Quand le storyboard
   a raison, écrivez la case manquante dans le lieu.

<!-- step: commit -->
5. **Committer les deux ensemble.** L’annulation du Studio ne couvre pas les enregistrements du storyboard : git est
   l’historique de `storyboard.json`.

<a name="alternatives"></a>

## Alternatives écartées

- **Générer les lieux à partir du storyboard.** Le storyboard dit *ce qui se passe* en prose (« Use pipe with water
  tank ») ; un lieu demande des ids exacts, des conditions, des états et une géométrie. Un générateur devrait les
  deviner, et la génération suivante écraserait ses suppositions. La couverture laisse une personne (ou un assistant)
  écrire le lieu, et montre ce qui reste à faire.
- **Faire des lieux la seule source.** Le texte vit alors dans le code, éparpillé par lieu, et ne peut pas se relire
  comme une histoire avant que les lieux existent.

<a name="trade-offs"></a>

## Compromis

Deux copies de chaque réplique, tenues alignées par discipline et mesurées par la couverture. Cela coûte une passe après
chaque changement ; en échange, l’histoire reste lisible seule, à tout moment, par quelqu’un qui ne lit pas le code.
Pour un tout petit jeu écrit d’une traite, le storyboard peut rester sommaire ; il vaut son entretien dès que plusieurs
personnes, plusieurs langues ou des voix entrent en jeu.

<a name="decisions"></a>

## Décisions et références

- [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md),
  [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (normalisation et `storyboardProblems`),
  [`src/engine/tools/coverage.ts`](../../src/engine/tools/coverage.ts) (couverture),
  [`tests/coverage.test.ts`](../../tests/coverage.test.ts),
  [`tests/diagnostics-parity.test.ts`](../../tests/diagnostics-parity.test.ts).
- Une seule normalisation et un seul diagnostic pour tous les lecteurs depuis 4.1.0 ([`CHANGELOG.md`](../../CHANGELOG.md)).
- [Le storyboard dans le Studio](studio.storyboard.md) · [Pages de relecture](create.review-pages.md) ·
  [Concevoir des énigmes](create.puzzle-design.md) · [Travailler avec une IA](create.working-with-ai.md).
