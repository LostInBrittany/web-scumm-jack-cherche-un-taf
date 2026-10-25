# Un mini-jeu sur mesure

Quand aucun des [mini-jeux intégrés](create.minigames.md) ne convient, un jeu écrit le sien en TypeScript et le lance
avec la même commande `minigame`. Cette page en déroule un, du contrat jusqu’aux vérifications.

<a name="overview"></a>

## Vue d’ensemble : les mini-jeux comme greffons

Le moteur fournit pipes, cables, pick, hide, runner, stroke, scratch et la roue de codes. Un jeu ajoute les siens dans
les `minigames` qu’exporte son module (`index.ts`) : un objet `{ run(ctx): Promise<void>; required?: string[] }` où
`ctx` donne l’élément de superposition, l’échelle, les images, les sons, les `params` de la commande et un signal
d’annulation ; `required` nomme les params que le validateur vérifie. `{ minigame: 'duel', params: { … }, then: [ … ] }`
le joue ensuite comme un mini-jeu intégré. C’est le format des greffons : le même contrat que les mini-jeux intégrés.

Le module public `@quest-n-click/engine/minigames` donne ce qu’il faut à un greffon :

| Nom | Quoi |
|---|---|
| `Minigame` | le contrat : `run(ctx)`, et ce que le validateur lit (`required`, `textParams`, `bindings`) |
| `MinigameCtx` | ce qu’un mini-jeu reçoit : sa zone, images, sons, paramètres, libellés, un signal d’abandon |
| `minigames` | ceux du moteur (pipes, stroke, pick, hide, runner, scratch, cables, code-wheel), chacun chargé quand il démarre |
| `MINIGAME_CSS` | leur style commun |

Les signatures complètes sont dans l’[API publique](engine.api.md#minigames) et dans
[`src/engine/minigames/types.ts`](../../src/engine/minigames/types.ts).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un mini-jeu à vous, enregistré sous un id, qu’un script ou une règle lance avec
`{ minigame: '<id>', params: { … }, then: [ … ] }` ; le validateur vérifie ses paramètres, ses images et ses sons
comme ceux d’un mini-jeu intégré, et le lecteur l’affiche par-dessus la scène avec le cadre de la voix des indices.

<a name="context-and-versions"></a>

## Contexte et versions

Un projet créé (le module est `game/index.ts`) ou un jeu du dépôt du moteur (`games/<id>/index.ts`). Le contrat est
public depuis la 4.0 ; le module s’appelle `@quest-n-click/engine/minigames` depuis la 4.2.5 (`web-scumm/minigames` avant,
retiré en 4.3.0 : `quest-n-click migrate` le renomme). `MinigameCtx.random` existe depuis la 4.1.15, le résultat
qu’un mini-jeu peut signaler depuis la 4.1.16.

<a name="prerequisites"></a>

## Prérequis

- Un jeu qui tourne : [Votre premier jeu](create.first-game.md).
- Des bases de TypeScript et de DOM : le mini-jeu se dessine avec le DOM du navigateur (ou un canvas).
- Les images et les sons qu’il emploie, préparés comme les autres ([Images](create.images.md),
  [Bruitages](create.sound-effects.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dossier du projet créé (`npx quest-n-click …`) ou dans le dépôt du moteur
(`GAME=<id> npm run …`). Le code va dans le module du jeu : `game/index.ts` dans un projet créé, `games/<id>/index.ts`
dans le dépôt du moteur.

<a name="steps"></a>

## Étapes

<!-- step: write-run -->
1. **Écrire `run(ctx)`.** Il remplit `ctx.root` (un élément par-dessus la scène, en 16:10 ; `ctx.u` est le nombre de
   pixels par unité logique, la largeur de la racine / 640), et renvoie une promesse qui se résout quand le joueur a
   gagné ou passé. Un mini-jeu n’échoue jamais de lui-même : la promesse se résout, et `then` s’exécute. Nettoyez
   quand `ctx.signal` est annulé (l’hôte ferme le mini-jeu). Les images viennent des `params` par `ctx.img(id)` et
   `ctx.size(id)` ; les sons par `ctx.sfx(id)` ; `ctx.instruct(texte)` affiche une réplique dans le cadre de la voix
   des indices ; `ctx.labels.skip` est le libellé « Passer » du jeu.

   ```ts
   // game/index.ts dans un projet créé (games/<id>/index.ts dans le dépôt du moteur)
   import type { Minigame } from '@quest-n-click/engine/minigames';

   const swordFight: Minigame = {
     required: ['foe'],
     textParams: ['intro', 'win'],
     bindings: { images: ['foe'], sfx: ['hit'] },
     run(ctx) {
       return new Promise<void>((resolve) => {
         const box = document.createElement('div');
         ctx.root.append(box);
         const done = () => {
           box.remove();
           resolve();
         };
         ctx.signal.addEventListener('abort', done, { once: true });
         if (typeof ctx.params.intro === 'string') ctx.instruct(ctx.params.intro);
         const foe = document.createElement('img');
         foe.src = ctx.img(String(ctx.params.foe));
         foe.style.height = `${120 * ctx.u}px`;
         let hits = 0;
         foe.addEventListener('click', () => {
           if (typeof ctx.params.hit === 'string') ctx.sfx(ctx.params.hit);
           hits += 1;
           if (hits === 3) {
             if (typeof ctx.params.win === 'string') ctx.instruct(ctx.params.win);
             setTimeout(done, 1200);
           }
         });
         const skip = document.createElement('button');
         skip.textContent = ctx.labels.skip;
         skip.addEventListener('click', () => {
           box.dispatchEvent(new CustomEvent('mg-skip', { bubbles: true }));
           done();
         });
         box.append(foe, skip);
       });
     },
   };
   ```

<!-- step: declare-contract -->
2. **Déclarer ce que lisent les outils.** `required` : les params qu’un `{ minigame }` doit donner, sinon le
   validateur le refuse. `textParams` : les chemins pointés des chaînes visibles par le joueur dans `params` (`*`
   parcourt chaque élément d’un tableau ou valeur d’un objet, comme dans `rounds.*.prompt`). `bindings` : les params
   qui nomment une image (`images`) ou un son de `audio.sfx` (`sfx`), dont le validateur vérifie l’existence. Tout
   param texte qui a la forme d’un id d’image (`dossier/nom`) est aussi vérifié comme image.

<!-- step: register -->
3. **L’enregistrer** dans les `minigames` du module, que le modèle exporte déjà vide :

   ```ts
   export const minigames: Record<string, Minigame> = { sword_fight: swordFight };
   ```

   Le lecteur, le Studio et le validateur lisent tous cet export, fusionné par-dessus les mini-jeux intégrés. Un id
   qui est déjà celui d’un mini-jeu intégré le remplace pour ce jeu.

<!-- step: use-command -->
4. **Le jouer** depuis une règle, un sujet ou un script :

   ```ts
   { minigame: 'sword_fight', params: { foe: 'pirate/r1c1', hit: 'clang', intro: 'Trois touches !', win: 'Touché.' },
     then: [{ set: 'pirate_beaten' }] }
   ```

<!-- step: report-result -->
5. **Dire comment il s’est terminé (facultatif).** Le lecteur écrit le résultat dans le drapeau réservé
   `minigame.<id>` : `skipped` quand un événement `mg-skip` remonté est sorti de la zone du mini-jeu (comme l’envoie le
   bouton Passer ci-dessus), `won` sinon. Pour donner un autre résultat (`passed`, `failed`, `disabled`), émettez
   depuis `ctx.root` un `new CustomEvent('mg-record', { bubbles: true, detail: { result: 'failed' } })` remonté avant
   de résoudre. L’histoire le lit avec `{ flag: 'minigame.sword_fight', eq: 'failed' }`.

<!-- step: check -->
6. **Vérifier.**

   ```sh
   # dans le projet créé
   npx quest-n-click validate
   npx quest-n-click dev
   ```

   ```sh
   # dans le dépôt du moteur
   GAME=mygame npm run validate
   GAME=mygame npm run dev
   ```

> [!LIMIT id=custom-minigame-solver]
> Le solveur n’exécute pas `run` : il compte le mini-jeu gagné, exécute `then`, et n’enregistre aucun drapeau
> `minigame.<id>`. Mettez l’effet du mini-jeu sur la partie dans `then` (ou dans les commandes qui suivent), jamais
> dans `run` : la sauvegarde, le solveur et la rediffusion ne connaissent que les commandes.

> [!LIMIT id=custom-minigame-i18n-extract]
> `npm run i18n -- extract` (`npx quest-n-click i18n extract`) écrit les textes des params des mini-jeux intégrés, pas
> ceux d’un mini-jeu propre au jeu : en 4.4.0 il lit le jeu sans les `minigames` de son module. Ses `textParams` sont
> appliqués quand le lecteur charge une traduction, mais c’est à vous d’ajouter leurs chemins au fichier de langue, et
> une extraction suivante peut les ranger en `_stale`.

> [!LIMIT id=custom-minigame-random]
> `ctx.random` (un tirage dans le flux `minigame:<id>` de la partie, le même pour la même graine) est fourni par le
> lecteur du moteur et peut manquer sous un autre hôte. Préférez-le à `Math.random` quand une disposition ou un
> rythme doivent se rejouer à l’identique.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`validate` ne dit rien sur la commande. Dans le jeu, la règle ouvre le mini-jeu par-dessus la scène, la voix des
indices affiche `intro`, trois touches affichent `win` et le ferment, et `pirate_beaten` est posé ; Passer le ferme
tout de suite et `then` s’exécute aussi. Le journal de développement (`?dev`) montre le changement du drapeau
`minigame.sword_fight`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `unknown minigame: "sword_fight" (known: …)` | Absent des `minigames` du module, ou une faute dans l’id | L’enregistrer sous cet id exact |
| `minigame "sword_fight": missing required param "foe"` | La commande ne donne pas un param listé dans `required` | Ajouter le param, ou le retirer de `required` |
| `minigame "sword_fight": "foe" must be an image id` | Un param de `bindings.images` n’est pas une chaîne | Donner un id d’image, `dossier/nom` |
| `minigame "sword_fight": unknown sound "clang" (audio.sfx)` | Un param de `bindings.sfx` ne nomme aucun son de `audio.sfx` | Déclarer le son ([Bruitages](create.sound-effects.md)) |
| `… image not found: "pirate/r1c1"` | L’image n’est pas découpée ou pas préparée | `npm run assets` (`npx quest-n-click assets`) |
| Le mini-jeu ne se ferme jamais | La promesse de `run` ne se résout jamais | La résoudre à la victoire, au passage et à l’annulation de `ctx.signal` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le module du jeu (`game/index.ts`, ou `games/<id>/index.ts`) et le contenu qui le lance. Les sauvegardes d’un joueur
gagnent le drapeau `minigame.<id>` une fois le mini-jeu joué.

<a name="recovery"></a>

## Revenir en arrière

Retirez la commande, puis l’entrée de `minigames` : le validateur refuse une commande dont le mini-jeu n’est plus
enregistré, il montre donc chaque endroit oublié. Un drapeau `minigame.<id>` dans d’anciennes sauvegardes y reste, sans
effet tant que l’histoire ne le lit pas.

<a name="references"></a>

## Références

- [`src/engine/minigames/types.ts`](../../src/engine/minigames/types.ts) : le contrat ; les mini-jeux intégrés à côté
  sont des exemples qui marchent (`src/engine/minigames/util.ts` contient leurs aides, hors de l’API publique).
- [`src/engine/dom/presenter.ts`](../../src/engine/dom/presenter.ts) : comment le lecteur lance un mini-jeu et lit son
  résultat.
- [Mini-jeux intégrés](create.minigames.md), [API publique](engine.api.md#minigames),
  [Code sur mesure](create.custom-code.md) pour les commandes sur mesure.
