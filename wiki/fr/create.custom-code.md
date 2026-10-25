# Code sur mesure

Quand le DSL ne suffit pas, un jeu définit ses propres commandes en TypeScript. Cette page explique comment elles
restent compatibles avec le validateur, le solveur et la sauvegarde, et comment en écrire une.

<a name="custom-commands"></a>

## Les commandes sur mesure

Un jeu exporte ses propres commandes depuis son `index.ts` (`game/index.ts` dans un projet créé,
`games/<id>/index.ts` dans le dépôt du moteur) ; une règle ou un script en appelle une par son nom :

```ts
import type { CustomCommands } from '@quest-n-click/engine/content';

export const commands: CustomCommands = {
  sparkle: { pure: true, run: async ({ scene, args }) => { /* dessiner des étoiles sur `scene` pendant args.ms */ } },
  explode: { effects: [{ set: 'chicken_exploded' }, { lose: 'chicken' }, { sfx: 'boom' }], run: ({ scene }) => { /* l'explosion */ } },
};
// dans une règle ou un script :  { custom: 'sparkle', args: { ms: 1200 } }
```

Une commande sur mesure a deux parties ([`src/engine/core/custom.ts`](../../src/engine/core/custom.ts)) :

- **`effects`** dit ce que la commande fait au jeu, en commandes ordinaires. Elles s'exécutent en premier, dans le
  navigateur **et** dans le solveur : une commande sur mesure ne casse donc jamais `npm run solve` ni la sauvegarde.
- **`run`** est la partie visuelle, navigateur seulement. Elle reçoit le jeu, l'état à lire, la salle, les arguments
  (`args`), le présentateur (`ui`), l'élément de la scène (`scene`, peintre DOM seulement) et `fast` (vrai pendant
  qu'on passe une cinématique : finir tout de suite). Elle ne tourne ni dans node, ni pendant qu'on passe une
  cinématique.

Une commande qui ne change rien dit `pure: true`. Le validateur refuse un `{ custom }` qui nomme une commande que le jeu
n'exporte pas, et une commande qui ne déclare ni `effects` ni `pure` ; il vérifie les commandes de `effects` comme
toutes les autres.

> [!GUARANTEE id=custom-effects-everywhere]
> Les `effects` déclarés d'une commande sur mesure s'appliquent pareil dans le moteur et dans le solveur ; son `run` ne
> tourne que quand on demande au moteur de l'exécuter.

> [!LIMIT id=run-must-not-change-state]
> `run` ne doit pas toucher à l'état. En mode développement (journal actif), le moteur compare l'état avant et après,
> et signale dans le journal et au gestionnaire d'erreurs un `run` qui a changé quelque chose hors de ses `effects`
> (`custom "x" changed … outside its declared effects`). En production rien ne l'en empêche, et le solveur, les
> sauvegardes et le rejeu ne connaissent que `effects` : un changement fait par le seul `run` leur est invisible.

<a name="steps"></a>

## En écrire une

<!-- step: declare -->
1. Dans le `index.ts` du jeu, ajoutez la commande aux `commands` exportées (le modèle en exporte un objet vide).
   Mettez dans `effects` chaque changement du jeu, en commandes du DSL ; s'il n'y en a aucun, écrivez `pure: true`.

<!-- step: draw -->
2. Écrivez `run` : dessinez dans `scene`, attendez votre animation, rangez derrière vous, et rendez la main tout de
   suite quand `fast` est vrai.

<!-- step: call -->
3. Appelez-la depuis une règle, un sujet ou un script : `{ custom: 'explode', args: { … } }`.

<!-- step: check -->
4. Vérifiez-la :

   ```sh
   # dans le dépôt du moteur
   npm run validate
   npm run solve
   ```

   ```sh
   # dans le projet créé
   npx quest-n-click validate
   npx quest-n-click solve
   ```

   Puis jouez-la sur le serveur de développement (`npm run dev`), console du navigateur ouverte : un `run` qui change
   l'état y est signalé.

Un mini-jeu est l'autre sorte de code de jeu : [un mini-jeu sur mesure](create.custom-minigame.md).

<a name="why"></a>

## Pourquoi les effets sont déclarés

Le contenu est une donnée pour que chaque outil puisse le lire ([principes](create.principles.md#why)). Une fonction
ne se lit pas sans l'exécuter, et le solveur et le validateur tournent dans node, sans navigateur. Déclarer les effets
en commandes du DSL permet au solveur de les appliquer sans le code, à la sauvegarde de les retenir, et au rejeu de les
reproduire ; le code garde ce que seul un navigateur sait faire, dessiner.

Le code est de confiance : il est livré avec le jeu et haché dans son empreinte (`trustedExtensions`, si bien qu'un
changement du code d'une commande sur mesure est vu comme tel). Sur un Studio hébergé, le code du jeu, commandes sur
mesure comprises, tourne dans un worker séparé qui ne détient aucun secret de la plateforme
([ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md)).

<a name="alternatives"></a>

## Solutions écartées

- **Des fonctions dans le contenu** : le solveur devrait exécuter le code du navigateur, ou l'ignorer et prouver un
  autre jeu.
- **Un greffon qui change l'état librement** : sauvegardes et rejeux ne reproduiraient plus une partie.

<a name="trade-offs"></a>

## Compromis

Une commande dont l'effet dépend de ce qui se passe dans son `run` (un jeu de réflexe dont l'issue change l'histoire)
ne s'exprime pas en `effects` fixes : c'est un mini-jeu, dont le moteur enregistre le résultat et que le solveur
explore. Certaines idées demandent une commande sur mesure là où trois lignes de code auraient suffi.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0002, le contenu est une donnée ; le code dont un jeu a besoin est de confiance et nommé](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, le solveur fait tourner le vrai moteur](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0028, où un Studio hébergé exécute le code du jeu](../../docs/dev/adr/0028-studio-content-execution.md)
