# Langue et objectifs

L'onglet Language montre le jeu tel que le voient les outils : ses objectifs d'abord, modifiables par des formulaires
générés depuis leur schéma, puis son IR, la logique du jeu en données avec le `fichier:ligne` qui écrit chaque pièce.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un objectif ajouté ou changé dans le fichier du jeu depuis un formulaire, prévisualisé en diff, validé avant d'être
écrit ; et l'endroit, dans le code, de chaque lieu, règle, sujet, écouteur et script.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dépôt du moteur ou projet créé. Vrai depuis la 4.2.1 (l'écriture est jugée avant d'être faite). Ce
que sont les objectifs et comment un jeu s'en sert : [Chapitres et objectifs](create.chapters.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Un fichier de jeu avec `defineGame({...})` ; un dossier qui n'en a pas répond `no defineGame({...}) in the game folder`
  (404).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Language. `npm run ir` se lance dans le dépôt du moteur.

<a name="steps"></a>

## Étapes

<!-- step: read-objectives -->
1. **Lisez les objectifs.** Chacun avec son id, son titre, sa condition (`done`), son parent, s'il est facultatif, et
   le `fichier:ligne` qui l'écrit.

<!-- step: edit -->
2. **Edit** sur un objectif, ou **+ objective**. Le formulaire est généré depuis le schéma d'un objectif
   ([`src/studio/forms-gen.ts`](../../src/studio/forms-gen.ts)) : chaque champ avec sa description, l'id du parent
   avec les objectifs du jeu en suggestions, la condition avec l'éditeur du DSL. Un problème est nommé par fichier, id
   et champ avant tout envoi.

<!-- step: preview -->
3. **Preview the change** montre le diff du fichier du jeu. **Apply** l'écrit : le serveur valide le jeu tel qu'il
   serait, et refuse l'écriture si elle ajoute une erreur ; un objectif dont le `done` ne peut jamais tenir est donc
   refusé. Les erreurs du validateur s'affichent ensuite. Undo dans l'en-tête reprend un changement appliqué
   ([Aperçu, application, annulation](studio.preview-apply.md)).

<!-- step: ir -->
4. **Lisez l'IR.** Sous les objectifs : les lieux, entités, règles, sujets, écouteurs et scripts, chacun avec l'endroit
   qui l'écrit, et l'IR entière en JSON. Le même JSON s'obtient en ligne de commande :

   ```sh
   # dans le dépôt du moteur
   npm run ir -- --json
   ```

> [!LIMIT id=game-file-objectives-only]
> Par le Studio (et l'outil `set_value` sur `@game`), seuls les objectifs du fichier du jeu s'écrivent : `objectives`,
> `objectives.<id>` ou un de ses champs. Tout autre chemin de `defineGame({...})` est refusé (400).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

L'objectif apparaît dans la liste avec son nouveau `fichier:ligne` ; `git diff` montre le changement dans le fichier du
jeu ; l'onglet Check valide et résout toujours.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Un champ est signalé en rouge avant l'envoi | La vérification du formulaire (fichier, id, champ) | Corriger ce champ |
| `refused: the edit adds N validation error(s): …` (422) | L'objectif casse le jeu (un `done` qui ne peut jamais tenir, un parent inconnu) | Lire les erreurs et changer l'objectif |
| 400 sur un autre chemin que `objectives` | Seuls les objectifs s'écrivent dans le fichier du jeu | Modifier les autres champs dans le code |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le fichier du jeu qui porte `defineGame({...})` (`games/<id>/game.ts` ou là où le jeu le définit).

<a name="recovery"></a>

## Revenir en arrière

Undo dans l'en-tête, pendant la session ; sinon git.

<a name="references"></a>

## Références

- [`src/studio/ir-tab.ts`](../../src/studio/ir-tab.ts), [`src/studio/forms-gen.ts`](../../src/studio/forms-gen.ts), [`tools/ir.ts`](../../tools/ir.ts).
- [Formats de fichiers](engine.file-formats.md), [Référence du DSL](create.dsl.md).
