# Principes du contenu et contrat d'identité

Pourquoi un jeu quest'n'click s'écrit en données, pourquoi sa géométrie vit dans un fichier à part, et pourquoi tout ce
qu'une sauvegarde retient porte un identifiant stable.

<a name="overview"></a>

## Écrire le contenu du jeu

Cette page et les autres pages « Créer un jeu » s'adressent à qui écrit l'histoire : les salles, les répliques, les
énigmes. Elles décrivent le format que lit le moteur. Vous n'avez jamais à toucher au moteur (`src/engine/`) : tout le
jeu tient dans un dossier, `games/<id>/` dans le dépôt du moteur, `game/` dans un projet fait avec
`quest-n-click create` ([organisation des deux](create.project-layout.md)).

Les types complets, commentés, sont dans [`src/engine/core/types.ts`](../../src/engine/core/types.ts), qui réexporte
les fichiers de `src/engine/core/types/` (découpés par sujet en 4.1.0). Votre éditeur les propose en autocomplétion.
La [référence du DSL](create.dsl.md), générée, liste chaque commande et chaque condition.

Ces pages remplacent l'ancien `docs/fr/CONTENT_GUIDE.md`, découpé par question. Depuis la bascule de la 4.5, cet
ancien fichier est une page de transition : il garde toutes ses anciennes ancres, chaque ancien titre renvoie à
ses nouvelles destinations ici, et un lien de secours vers `blob/v4.4.0/docs/fr/CONTENT_GUIDE.md` marche toujours.

<a name="principles"></a>

## Les principes

1. **Du contenu, pas du code.** Le contenu est fait de données : des objets, des listes, des textes. Aucune fonction.
   C'est ce qui permet au moteur de vérifier le jeu tout seul (`npm run validate`) et de prouver qu'on peut le finir
   (`npm run solve`).
2. **La logique d'un côté, la géométrie de l'autre.** Vous écrivez *ce qui se passe* dans `rooms/<salle>.ts`. *Où
   sont les choses* (rectangles cliquables, position des personnages, zone de marche) vit dans `layout/<salle>.json`,
   placé à la souris dans l'éditeur de placement (`npm run dev`, puis `?edit=<salle>`) ou dans le Studio. Vous ne
   tapez jamais de coordonnées à la main, sauf pour un déplacement scripté ponctuel ([géométrie](create.geometry.md)).
3. **Rien n'est une impasse.** Toute action reçoit une réponse. Sans réaction écrite, le moteur répond avec les
   réponses de repli du jeu ([réactions](create.reactions.md#fallbacks)).
4. **Des coordonnées logiques.** Un décor mesure 640 × 400, origine en haut à gauche. Un personnage se place par
   les pieds.

> [!LIMIT id=custom-code-is-code]
> « Aucune fonction » vaut pour le contenu. Ce dont un jeu a vraiment besoin au-delà du DSL, une commande sur mesure
> ou un mini-jeu, est du TypeScript à lui, à côté du contenu, nommé dans le jeu et qui déclare ses effets
> ([code sur mesure](create.custom-code.md)).

<a name="identity-contract"></a>

## Le contrat d'identité v3

Un nouveau jeu pose `schemaVersion: 3` dans `game.ts` (le modèle le fait). Tout ce dont la position d'exécution
survit dans une sauvegarde porte un identifiant explicite et unique : chaque `Rule`, `TalkTopic`, `Choice`,
`EventRule`, et chaque bloc `once`, `nth`, `cycle` ou `random`. Un `ScriptDef` a déjà son id et ajoute une entrée
`stepIds` par commande de premier niveau. Le validateur refuse un jeu v3 dont un id manque ou se répète
(`… requires a stable "id" in schema v3`, `duplicate stable id "…"`,
`schema v3 script needs one stable step id per command`). Réordonner le contenu ou traduire un texte ne change donc
pas le sens d'une sauvegarde.

```ts
schemaVersion: 3,
// …
{ id: 'open.pantry', verb: 'open', a: 'pantry', do: […] }
{ id: 'ask.key', topic: 'Où est la clé ?', do: […] }
{ once: […], id: 'arrival.first' }
{ id: 'clock', stepIds: ['wait', 'chime'], do: [{ wait: 1000 }, { sfx: 'chime' }] }
```

Les répliques peuvent aussi porter un id (`{ say: [...], id }`, `{ id, text }` dans une liste) : traductions et clips
de voix suivent alors l'id, pas la position de la réplique (`npm run ids -- --lines`).

`npm run ids -- --write --map` écrit ces ids dans un jeu existant, avec l'étape de migration dont ses sauvegardes ont
besoin ; renommer un id plus tard sans casser les sauvegardes est expliqué dans
[état et sauvegardes](create.state-saves.md#renaming-an-id). `compileGame(source)`
([`src/engine/core/define.ts`](../../src/engine/core/define.ts)) clone et normalise la source une seule fois ; un
résultat v3 est gelé, si bien qu'un outil qui tente de le modifier échoue tout de suite. Moteur, validateur, solveur,
rejeu et outils d'énigmes consomment tous cette même représentation compilée. Lisez les
[notes de passage v2 → v3](install.upgrade-notes-v2-to-v3.md) avant de convertir un jeu existant.

> [!LIMIT id=ids-not-renames]
> Les ids stables protègent une sauvegarde contre un réordonnancement et une traduction. Ils ne la protègent pas
> contre un renommage : changer un id change le sens, et demande une étape de migration (`migrations` dans `game.ts`).

<a name="why"></a>

## Pourquoi

Un jeu doit être vérifié, sauvegardé, traduit, comparé entre deux révisions, édité par le Studio et par un assistant,
et prouvé finissable par une machine. Une fonction glissée dans le contenu ne permet rien de tout cela : aucun outil
ne sait ce qu'elle fait sans l'exécuter. Des données, tous les outils les lisent. Le solveur fait même tourner le vrai
moteur sur ces données : ce qu'il prouve, un joueur peut le faire ([ce que prouve le solveur](create.solver-proofs.md)).

La géométrie est à part parce qu'elle s'édite autrement (à la souris, sur l'image) et change pour d'autres raisons (un
nouveau décor déplace tous les rectangles, pas une règle).

<a name="alternatives"></a>

## Solutions écartées

- **Des scripts dans un langage généraliste** (des fonctions dans le contenu) : souple, mais le validateur, le
  solveur, le Studio et les outils de traduction perdraient le jeu de vue.
- **Des ids par position** (la règle du schéma 2 : un sujet vaut `<salle>.<acteur>.<index>`) : rien à écrire, mais
  insérer un sujet ou traduire un texte décalait ce que voulait dire une ancienne sauvegarde. Le schéma 3 a rendu les
  ids explicites.

<a name="trade-offs"></a>

## Compromis

Certaines idées demandent une commande sur mesure là où trois lignes de code auraient suffi, et le DSL grandit
lentement, une primitive par besoin réel. Écrire les ids est un travail de plus ; `npm run ids -- --write` en fait
l'essentiel.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0002, le contenu est une donnée ; le code dont un jeu a besoin est de confiance et nommé](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, le solveur fait tourner le vrai moteur](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0026, les sauvegardes d'une révision à l'autre](../../docs/dev/adr/0026-saves-across-revisions.md)
- Sources : [`src/engine/core/content-ids.ts`](../../src/engine/core/content-ids.ts) (les ids stables),
  [`src/engine/core/define.ts`](../../src/engine/core/define.ts) (`compileGame`).
