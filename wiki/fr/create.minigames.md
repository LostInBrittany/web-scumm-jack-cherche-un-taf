# Mini-jeux intégrés

Le moteur fournit huit mini-jeux. Un jeu en lance un avec la commande `minigame` ; quand il se termine, les commandes
de `then` s’exécutent. Cette page liste chacun, son geste et ses paramètres, tels que le code de la 4.4.0 les lit
([`src/engine/minigames/`](../../src/engine/minigames/)). Pour écrire le vôtre, voir
[Un mini-jeu sur mesure](create.custom-minigame.md).

<a name="available"></a>

## Le contrat, et la liste

Chaque mini-jeu déclare son contrat : les params `required`, `textParams` (les chaînes visibles par le joueur,
extraites pour la traduction) et `bindings` (les params qui nomment une image ou un son : `validate` vérifie qu’ils
existent, par exemple `sfx` de `stroke`, `sfx.ring` / `sfx.stamp` de `cables`, `ticket` et `sfx` de `scratch`). Leurs
métadonnées sont dans [`src/engine/minigames/meta.ts`](../../src/engine/minigames/meta.ts).

> Où lancer les commandes : cette page les écrit pour le dépôt du moteur (`npm run validate`, `npm run solve`, précédées
> de `GAME=<id>` pour un autre jeu que celui par défaut). Dans un projet créé, les mêmes outils sont
> `npx quest-n-click validate`, `npx quest-n-click solve` (`--prove`, `--chapters`), `npx quest-n-click lint`,
> `npx quest-n-click i18n status` et `npx quest-n-click voices`, et les sources sont dans `game/` au lieu de
> `games/<id>/`.

Tous les mini-jeux sauf `pick` et `code-wheel` acceptent `intro` (une consigne de la voix des indices au début) ;
`pick` affiche à la place le `prompt` de chaque manche, `code-wheel` sa `question`. Tous sauf `scratch` acceptent `win`
(la phrase de fin). Le moteur ne nomme aucune image : chaque mini-jeu reçoit les siennes par `params`. Les paramètres
**en gras** sont obligatoires ; `npm run validate` signale ceux qui manquent
(`minigame "pipes": missing required param "tank"`), et un id inconnu (`unknown minigame: "…" (known: …)`).

| Id | Geste | Paramètres |
|---|---|---|
| `pipes` | Toucher un tuyau pour le faire tourner d’un quart de tour | **`tiles`** `{ ground, straight: [sec, mouillé], elbow: [sec, mouillé], tee: [sec, mouillé] }` (images de base : droit gauche-droite, coude gauche-bas, té gauche-droite-bas), **`source`**, **`nozzle`** `[sec, qui arrose]`, **`tank`**, `mushrooms` `[assoiffé, content]`, `cols` (4), `rows` (3), `helpAfter` (15 taps avant que le bon tuyau scintille), `background` |
| `stroke` | Caresser lentement : une jauge monte | **`target`** (image de l’animal), **`hand`** (image de la main fantôme), `goal` (100), `sfx` (bruit de la réussite), `tooFast` (phrase si trop vite) |
| `pick` | Toucher la bonne image | **`rounds`** `[{ prompt, options: [image…], answer }]`, `decoy` (image piège), `decoyLine`, `wrongLine`, `background` |
| `hide` | Trouver la bonne cachette | **`spots`** `[{ img, x, y, h, reply, found }]`, `bg` (image de fond), `answer` (index de la bonne ; par défaut la dernière) |
| `runner` | Haut de l’écran : sauter, bas : se baisser | **`hero`** `{ run: [images], jump, slide, stumble, h, slideH }`, `buddy` (même forme, second coureur derrière), **`chaser`** `{ frames: [images], fps, x, speed, h }`, **`obstacles`** `{ jump, duck }` (à sauter au sol, à éviter en se baissant), **`bg`** (décor qui défile), `seconds` (20), `stumble` (phrase quand on trébuche) |
| `cables` | Tirer une fiche : son câble gigote dans le nœud ; la glisser sur la bonne prise | **`board`** (panneau de 4 prises), **`knot`**, **`plugs`** `{ couleur: image }` (ids de couleur libres, 4 au plus), `sockets` (ordre des couleurs sur le panneau, de haut en bas), `tints` `{ couleur: css }`, `gags` (`lamp`, `phone`, `toaster`, `windows` ; un gag sans ses images ou son texte est retiré), `lampOn`, `lampOff`, `phone`, `toaster`, `windowsText`, `sfx: { ring, stamp }`, `helpAfter` (4), `background` |
| `scratch` | Gratter un ticket | **`ticket`** (image), `text`, `color`, `sfx` (bruit pendant qu’on gratte), `threshold` (0,55 de la surface), `cover` (texte imprimé sur la couche argentée), `hold` (3200 ms d’affichage une fois révélé), `background`, `skippable` ; utilisé par la fin scellée via `ending.scratch` |
| `code-wheel` | Tourner deux disques, lire la fenêtre, donner la réponse | **`actors`** `[{ id, label, img? }]` (de 3 à 11, en nombre impair), **`symbols`** (autant), **`answers`** (autant, toutes différentes), `mode` (`parody`), `tries` (3), `seed`, et les textes `question`, `wrong`, `pass`, `win`, `fail`, `list`, `turnLeft`, `turnRight` |

Un jeu peut ajouter ses propres mini-jeux : `export const minigames = { monjeu: { required: ['…'], run(ctx) { … } } }`
dans `index.ts` ([Un mini-jeu sur mesure](create.custom-minigame.md)).

Exemple :

```ts
{ music: { push: 'minigame' } },
{ minigame: 'pipes', params: {
  tiles: { ground: 'pipes/r3c1', straight: ['pipes/r3c2', 'pipes/r3c5'], elbow: ['pipes/r3c3', 'pipes/r3c6'], tee: ['pipes/r3c4', 'pipes/r4c1'] },
  source: 'pipes/r4c2', nozzle: ['pipes/r4c3', 'pipes/r4c4'], tank: 'maison/r3c6', mushrooms: ['maison/r4c5', 'maison/r4c6'],
  intro: 'Khhh… tourne les tuyaux… jusqu’aux plantes.', win: 'Khhh… elles ont bu.',
}, then: [
  { music: { pop: true } },
  { say: ['grandpere', 'Merci. Maintenant, je me souviens : j’ai laissé ta clé au marché.'] },
  { unlock: 'marche' },
] },
```

`{ music: { push: 'minigame' } }` et `{ music: { pop: true } }` autour passent à la musique du mini-jeu et en reviennent
([Musique en stems](create.music.md)).

> [!LIMIT id=minigame-solver-counts-won]
> Le solveur ne joue pas un mini-jeu : il le compte gagné et exécute `then`. Une énigme que seul le résultat d’un
> mini-jeu décide n’est pas prouvée par `npm run solve`.

<a name="skip-and-failure"></a>

## Passer, échouer, et le résultat

- **Passer.** Chaque mini-jeu intégré a un bouton « Passer », sauf `scratch` (la fin scellée elle-même, sauf avec
  `skippable: true`) et un `code-wheel` en mode `strict`. Passer exécute quand même `then` : l’histoire continue. Son
  libellé est le `ui.skip` du jeu.
- **Échouer.** Aucun mini-jeu intégré ne s’échoue, sauf un `code-wheel` en mode `story`, qui se termine `failed`
  après ses `tries`.
- **Le résultat** (4.1.16). Dans le lecteur, un mini-jeu qui se termine écrit comment dans le drapeau réservé
  `minigame.<id>` : `won`, `passed`, `skipped`, `failed` ou `disabled` (chaque mini-jeu dit `skipped` ou `won` ; seule
  la roue de codes dit les autres). L’histoire le lit avec `{ flag: 'minigame.pipes', eq: 'skipped' }`, le journal le
  rapporte comme `flagChanged`, et une session l’enregistre pour qu’une rediffusion le rejoue. Aucune commande ne peut
  poser un drapeau `minigame.*` (le validateur le refuse). Le solveur n’en enregistre aucun : il n’explore pas les
  branches accrochées à ce drapeau.

<a name="choosing"></a>

## En choisir un pour l’histoire

Utilisez-en un comme **une porte que le joueur comprend** : la fiction dit pourquoi on y joue. La cuve a besoin d’une
autre sortie, alors on pose des tuyaux. Le vendeur veut des fleurs, alors on les cueille. Restez court : 30 secondes,
pas 3 minutes (trois manches de `pick`, une grille 4 × 3 de `pipes`), avec `helpAfter` pour que le bon tuyau brille
quand le joueur est perdu, et des répliques `intro` et `win` dans la voix d’aide. Le raisonnement est dans
[Concevoir des énigmes](create.puzzle-design.md#minigames).

| Mini-jeu | Va avec une fiction sur |
|---|---|
| `pipes` | l’eau, la plomberie, l’arrosage, tout ce qui coule |
| `cables` | l’électricité, un standard, le nœud derrière la télé |
| `pick` | les courses, choisir le bon, une recette, une confrontation |
| `hide` | cache-cache, trouver quelqu’un ou quelque chose dans une scène |
| `runner` | une poursuite, une fuite, une course pour attraper un bus |
| `stroke` | calmer un animal, endormir un bébé |
| `scratch` | la fin scellée seulement ([La fin scellée](create.sealed-ending.md)) |
| `code-wheel` | une roue anti-copie des années 1990, pour rire, dessinée avec vos propres personnages ([Remix](create.remix.md)) |

<a name="pipes"></a>

## `pipes`

Une grille de tuyaux (`cols` × `rows`, 4 × 3 par défaut, au moins 2 × 1) à tourner jusqu’à ce que l’eau aille de
`source` à la buse (`nozzle`), qui arrose les champignons (`mushrooms`). Obligatoires : `tiles`, `source`, `nozzle`,
`tank`. Textes : `intro`, `win`. `helpAfter` (15) est le nombre de taps avant que le bon tuyau scintille.

<a name="stroke"></a>

## `stroke`

Caresser lentement la cible (`target`) du doigt ; la main fantôme (`hand`) montre le geste ; une jauge monte jusqu’à
`goal` (100). Obligatoires : `target`, `hand`. Textes : `intro`, `win`, `tooFast`. Liaison : `sfx` doit être un son
de `audio.sfx`.

<a name="pick"></a>

## `pick`

Des manches d’images ; toucher la bonne (`answer`) à chacune. Obligatoire : `rounds`. Textes : le `prompt` de chaque
manche, `decoyLine`, `wrongLine`, `win` ; pas d’`intro` (le `prompt` de la première manche l’ouvre). Une image piège
(`decoy`) dit `decoyLine` quand on la touche.

<a name="hide"></a>

## `hide`

Des cachettes dessinées sur `bg` ; chacune répond par sa `reply`, la bonne (`answer`, par défaut la dernière) termine.
Obligatoire : `spots`. Textes : `intro`, `win`, la `reply` de chaque cachette.

<a name="runner"></a>

## `runner`

Une poursuite qui défile pendant `seconds` (20) : toucher le haut de l’écran pour sauter, le bas pour se baisser.
Obligatoires : `hero`, `chaser`, `obstacles`, `bg`. Textes : `intro`, `win`, `stumble`. Les libellés « sauter » et
« se baisser » sont des textes d’interface du jeu.

<a name="cables"></a>

## `cables`

Jusqu’à quatre fiches, chacune emmêlée dans le nœud (`knot`), à glisser sur la bonne prise du panneau (`board`).
Obligatoires : `board`, `knot`, `plugs`. Textes : `intro`, `win`, `windowsText`. Liaisons : `sfx.ring` et `sfx.stamp`
doivent être des sons de `audio.sfx`. Un gag (`lamp`, `phone`, `toaster`, `windows`) sans ses images ou son texte est
retiré.

<a name="scratch"></a>

## `scratch`

Une couche argentée qui part sous le doigt ; il se termine quand `threshold` (0,55) de la surface est gratté et que le
`text` est resté affiché `hold` ms (3200). Obligatoire : `ticket`. Texte : `intro` (le `text` est la fin scellée
déchiffrée, donnée à l’exécution, jamais un contenu à traduire). Liaisons : `ticket` (une image) et `sfx`. Utilisé par
la fin scellée via `ending.scratch`.

<a name="code-wheel"></a>
<!-- applies: .. since 4.1.15 -->

## `code-wheel`

« The Extremely Legitimate Pirate Check » : deux disques dessinés avec les personnages et les symboles du jeu, jamais
un DRM (la réponse est dans la page, et la roue le dit). Obligatoires : `actors`, `symbols`, `answers` : un nombre
impair d’acteurs de 3 à 11, autant de symboles et autant de réponses, toutes différentes. `mode` : `parody` (par
défaut : après `tries` mauvaises réponses, 3 par défaut, le joueur passe, `passed`), `story` (se termine `failed` après
ses essais), `strict` (pas de bouton Passer, ne laisse jamais passer), `cosmetic` (toute réponse gagne), `disabled`,
`daily`. La graine (`seed`) est remplie par Remix à partir de celle du monde. Elle se tourne aux boutons, aux flèches
du clavier ou à la manette, s’annonce au lecteur d’écran et se lit comme une simple liste. `npm run code-wheel`
l’imprime. Tout le reste, sa preuve et les règles de speedrun : [Remix](create.remix.md).

<a name="related"></a>

## Identifiants liés

- La commande : `{ minigame: '<id>', params: { … }, then: [ … ] }` ([Commandes du jeu](create.commands.md)).
- Le drapeau `minigame.<id>` ; `ending.scratch` ; `audio.sfx` pour les liaisons.
- `npm run validate`, `npm run i18n` (les `textParams` sont extraits pour la traduction).
- L’API : `minigames`, `Minigame`, `MinigameCtx`, `MINIGAME_CSS` de `@quest-n-click/engine/minigames`
  ([API publique](engine.api.md#minigames)).
